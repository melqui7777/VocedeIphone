import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createIngestContext, ingestWebhookPayload, summarizeOutcomes } from '../_shared/kommoIngest.ts';

/**
 * Reconstrói as transcrições a partir dos payloads brutos em kommo_webhook_events.
 * A ingestão é idempotente e independe da ordem de chegada, então reprocessar:
 *  - recupera eventos que falharam (processed = false);
 *  - corrige remetente/agrupamento de mensagens gravadas pela lógica antiga (all = true);
 *  - com purge_legacy = true, remove mensagens antigas sem external_id (anteriores à
 *    deduplicação) das conversas do Kommo, antes de regravá-las a partir dos eventos.
 *
 * POST ?secret=KOMMO_WEBHOOK_SECRET  body: { "all": true, "purge_legacy": false, "since": "2025-01-01" }
 *
 * Processa até max_events (padrão 3000) ou ~90s por chamada, para caber no limite de tempo da
 * Edge Function; se a resposta trouxer "next", chame de novo enviando { ...body, after: next }.
 *
 * Recuperação automática de eventos que falharam — agendar no SQL Editor (pg_cron + pg_net já
 * habilitados na 0002), trocando <PROJECT_REF> e <SECRET>:
 *
 *   select cron.schedule('kommo-reprocess-failed', '0,10,20,30,40,50 * * * *', $$
 *     select net.http_post(
 *       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/kommo-reprocess?secret=<SECRET>',
 *       headers := '{"Content-Type": "application/json"}'::jsonb,
 *       body := '{"all": false}'::jsonb
 *     );
 *   $$);
 */
const CONCURRENCY = 10;
const TIME_BUDGET_MS = 90_000;

/** Todos os ids de conversas do Kommo, paginando (o PostgREST corta respostas em 1000 linhas). */
// deno-lint-ignore no-explicit-any
async function listKommoConversationIds(supabase: any): Promise<string[]> {
  const ids: string[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .like('external_id', 'kommo:%')
      .order('id')
      .range(from, from + page - 1);
    if (error) throw new Error(`listar conversas kommo: ${error.message}`);
    ids.push(...(data ?? []).map((c: { id: string }) => c.id));
    if (!data || data.length < page) break;
  }
  return ids;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== Deno.env.get('KOMMO_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const all = body.all === true;
    const purgeLegacy = body.purge_legacy === true;
    const since: string | null = typeof body.since === 'string' ? body.since : null;
    const maxEvents: number = Number.isInteger(body.max_events) && body.max_events > 0 ? body.max_events : 3000;

    if (purgeLegacy && !all) {
      // Apagar as mensagens legadas sem regravá-las a partir de todos os eventos deixaria buracos.
      return new Response(JSON.stringify({ ok: false, error: 'purge_legacy exige all: true' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let purged = 0;
    const purgedConversationIds = new Set<string>();
    // Só na primeira chamada de uma sequência paginada.
    if (purgeLegacy && !body.after) {
      const ids = await listKommoConversationIds(supabase);
      // Lotes de 100 UUIDs mantêm a URL do PostgREST bem abaixo do limite do gateway.
      for (let i = 0; i < ids.length; i += 100) {
        const { data: legacy, error } = await supabase
          .from('conversation_messages')
          .delete()
          .in('conversation_id', ids.slice(i, i + 100))
          .is('external_id', null)
          .select('conversation_id');
        if (error) throw new Error(`purge legacy: ${error.message}`);
        purged += legacy?.length ?? 0;
        for (const row of legacy ?? []) purgedConversationIds.add(row.conversation_id);
      }
    }

    const ctx = createIngestContext(supabase);
    const totals: Record<string, number> = {};
    let events = 0;
    const pageSize = Math.min(100, maxEvents);
    let lastReceivedAt: string | null = body.after?.received_at ?? null;
    let lastId: string | null = body.after?.id ?? null;
    // O cursor é interpolado num filtro .or() do PostgREST — só aceita timestamp ISO e uuid.
    if (
      (lastReceivedAt !== null || lastId !== null) &&
      !(
        typeof lastReceivedAt === 'string' &&
        /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(lastReceivedAt) &&
        typeof lastId === 'string' &&
        /^[0-9a-f-]{36}$/i.test(lastId)
      )
    ) {
      return new Response(JSON.stringify({ ok: false, error: 'cursor after inválido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    let hasMore = false;
    const startedAt = Date.now();

    // Paginação por cursor (received_at, id) — estável mesmo enquanto novos eventos chegam.
    while (true) {
      // 1º passo só com colunas leves: ordenar carregando o payload jsonb estoura o statement timeout.
      let query = supabase
        .from('kommo_webhook_events')
        .select('id, received_at')
        .order('received_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(pageSize);
      if (!all) query = query.eq('processed', false);
      if (since) query = query.gte('received_at', since);
      if (lastReceivedAt) {
        query = query.or(
          `received_at.gt."${lastReceivedAt}",and(received_at.eq."${lastReceivedAt}",id.gt."${lastId}")`
        );
      }
      const { data: page, error } = await query;
      if (error) throw new Error(`listar eventos: ${error.message}`);
      if (!page?.length) break;

      const { data: withPayload, error: payloadError } = await supabase
        .from('kommo_webhook_events')
        .select('id, payload')
        .in('id', page.map((r: { id: string }) => r.id));
      if (payloadError) throw new Error(`carregar payloads: ${payloadError.message}`);
      const payloadById = new Map((withPayload ?? []).map((r: { id: string; payload: unknown }) => [r.id, r.payload]));
      const rows = page.map((r: { id: string; received_at: string }) => ({ ...r, payload: payloadById.get(r.id) }));

      // Eventos em paralelo: a ingestão é idempotente e independe da ordem, e o lock da linha
      // da conversa serializa gravações concorrentes da mesma conversa.
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
          rows.slice(i, i + CONCURRENCY).map(async (row: { id: string; received_at: string; payload: unknown }) => {
            const outcomes = await ingestWebhookPayload(ctx, row.payload, row.id, new Date(row.received_at));
            const summary = summarizeOutcomes(outcomes);
            for (const [k, v] of Object.entries(summary.counts)) totals[k] = (totals[k] ?? 0) + v;
            const failed = outcomes.filter((o) => o.status === 'error');
            await supabase
              .from('kommo_webhook_events')
              .update({
                processed: failed.length === 0,
                processed_at: new Date().toISOString(),
                result: summary,
                error: failed.length ? failed.map((f) => `${f.message_id}: ${f.reason}`).join('\n') : null,
              })
              .eq('id', row.id);
            events += 1;
          })
        );
      }

      const last = rows[rows.length - 1];
      lastReceivedAt = last.received_at;
      lastId = last.id;
      if (rows.length < pageSize) break;
      // Devolve o cursor antes do limite de wall-clock da Edge Function, para nunca perder o progresso.
      if (events >= maxEvents || Date.now() - startedAt > TIME_BUDGET_MS) {
        hasMore = true;
        break;
      }
    }

    // Reconta as conversas que perderam mensagens legadas e não foram tocadas por nenhum evento.
    for (const conversationId of purgedConversationIds) {
      const { count } = await supabase
        .from('conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);
      await supabase.from('conversations').update({ messages_count: count ?? 0 }).eq('id', conversationId);
    }

    // Conversas do Kommo que ficaram vazias após o reagrupamento e não têm análise associada.
    let removed = 0;
    if (!hasMore) {
      const { data, error: cleanupError } = await supabase.rpc('kommo_delete_empty_conversations');
      if (cleanupError) throw new Error(`limpar conversas vazias: ${cleanupError.message}`);
      removed = data ?? 0;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        events,
        purged_legacy_messages: purged,
        removed_empty_conversations: removed,
        messages: totals,
        next: hasMore ? { received_at: lastReceivedAt, id: lastId } : null,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
