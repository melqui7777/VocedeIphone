import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchLeadChatMessageEvents, fetchEntityEventsRaw, fetchEntityNotesRaw } from '../_shared/kommo.ts';
import { compareWithKommoEvents, parseChatMessageEvents } from '../_shared/kommoMessage.ts';

/**
 * Compara a transcrição gravada de um lead com o registro de eventos do Kommo
 * (mensagens faltando, remetente invertido, horário divergente, ordem) e mostra como cada
 * author.type/direção recebido do Kommo foi classificado. Não devolve textos de mensagens.
 *
 * GET ?secret=KOMMO_WEBHOOK_SECRET&lead_id=123
 * GET ?secret=KOMMO_WEBHOOK_SECRET&sample=10&until=2026-08-20T00:00:00Z   (amostra de leads recentes até `until`)
 */

// deno-lint-ignore no-explicit-any
async function auditLead(supabase: any, leadId: string) {
  const stored = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('external_id, sender, sent_at, conversation_id, direction, message_type, kommo_contact_id, author_type:raw_payload->author->>type')
      .eq('kommo_lead_id', leadId)
      .order('sent_at', { ascending: true })
      .order('received_seq', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`listar mensagens: ${error.message}`);
    stored.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const rows = (stored ?? []) as Array<{
    external_id: string | null;
    sender: 'client' | 'seller' | 'bot' | 'system';
    sent_at: string;
    conversation_id: string;
    direction: string | null;
    message_type: string;
    kommo_contact_id: string | null;
    author_type: string | null;
  }>;

  const contactIds = [...new Set(rows.map((r) => r.kommo_contact_id).filter((c): c is string => !!c))];
  const kommo = parseChatMessageEvents(await fetchLeadChatMessageEvents(leadId, contactIds));

  // Como cada combinação vinda do Kommo foi classificada — confirma a regra de remetente com dados reais.
  const classification: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.direction ?? 'sem_direcao'} / author.type=${r.author_type ?? 'null'} -> ${r.sender}`;
    classification[key] = (classification[key] ?? 0) + 1;
  }

  // Marcadores contam como "presentes" na comparação (mesmo id), mas não têm texto: reporta à parte.
  // Um marcador incoming é uma mensagem do cliente cujo webhook nunca chegou.
  const placeholders = rows.filter((r) => r.message_type === 'unavailable');
  return {
    lead_id: leadId,
    conversations: [...new Set(rows.map((s) => s.conversation_id))],
    classification,
    text_available: rows.length - placeholders.length,
    placeholders_outgoing: placeholders.filter((r) => r.direction === 'outgoing').length,
    placeholders_incoming_webhook_lost: placeholders.filter((r) => r.direction === 'incoming').length,
    ...compareWithKommoEvents(kommo, rows),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== Deno.env.get('KOMMO_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const leadId = url.searchParams.get('lead_id');
  const sample = Math.min(Number(url.searchParams.get('sample') ?? 0) || 0, 25);
  if (!leadId && !sample) return json({ ok: false, error: 'informe lead_id ou sample' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    if (leadId && url.searchParams.get('notes') === '1') {
      // Tipos de nota e NOMES dos campos de params (sem valores) — verifica se mensagens de chat viram notas.
      // deno-lint-ignore no-explicit-any
      const summarize = (res: any) => {
        // deno-lint-ignore no-explicit-any
        const notes = ((res?._embedded as any)?.notes ?? []) as any[];
        const types: Record<string, { count: number; param_keys: string[]; created_by: number[] }> = {};
        for (const n of notes) {
          const t = String(n.note_type);
          types[t] ??= { count: 0, param_keys: [], created_by: [] };
          types[t].count += 1;
          for (const k of Object.keys(n.params ?? {})) if (!types[t].param_keys.includes(k)) types[t].param_keys.push(k);
          if (!types[t].created_by.includes(n.created_by)) types[t].created_by.push(n.created_by);
        }
        return { total: notes.length, types };
      };
      const { data: c } = await supabase
        .from('conversation_messages')
        .select('kommo_contact_id')
        .eq('kommo_lead_id', leadId)
        .not('kommo_contact_id', 'is', null)
        .limit(1);
      const contactId = c?.[0]?.kommo_contact_id ?? null;
      return json({
        ok: true,
        lead_id: leadId,
        lead_notes: summarize(await fetchEntityNotesRaw('leads', leadId)),
        contact_id: contactId,
        contact_notes: contactId ? summarize(await fetchEntityNotesRaw('contacts', contactId)) : null,
      });
    }
    if (leadId && url.searchParams.get('diagnose') === '1') {
      // Tipos de evento e formato de value_after existentes para o lead — sem textos.
      // deno-lint-ignore no-explicit-any
      const summarize = (res: any) => {
        // deno-lint-ignore no-explicit-any
        const events = ((res?._embedded as any)?.events ?? []) as any[];
        const types: Record<string, number> = {};
        for (const e of events) types[e.type] = (types[e.type] ?? 0) + 1;
        const chat_samples = events
          .filter((e) => /chat|message|talk/i.test(String(e.type)))
          .slice(0, 4)
          .map((e) => ({
            type: e.type,
            entity_type: e.entity_type,
            entity_id: e.entity_id,
            created_at: e.created_at,
            created_by: e.created_by,
            // só identificadores — nunca conteúdo
            messages: (Array.isArray(e.value_after) ? e.value_after : []).map((v: { message?: { id?: string; talk_id?: number; origin?: string } }) => ({
              id: v?.message?.id,
              talk_id: v?.message?.talk_id,
              origin: v?.message?.origin,
            })),
          }));
        return { total: events.length, types, chat_samples };
      };
      const { data: contacts } = await supabase
        .from('conversation_messages')
        .select('kommo_contact_id')
        .eq('kommo_lead_id', leadId)
        .not('kommo_contact_id', 'is', null)
        .limit(1);
      const contactId = contacts?.[0]?.kommo_contact_id ?? null;
      return json({
        ok: true,
        lead_id: leadId,
        lead: summarize(await fetchEntityEventsRaw('lead', leadId)),
        contact_id: contactId,
        contact: contactId ? summarize(await fetchEntityEventsRaw('contact', contactId)) : null,
      });
    }
    if (leadId) return json({ ok: true, ...(await auditLead(supabase, leadId)) });

    let query = supabase
      .from('conversations')
      .select('kommo_lead_id')
      .not('kommo_lead_id', 'is', null)
      .gt('messages_count', 2)
      .order('occurred_at', { ascending: false })
      .limit(sample * 3);
    const until = url.searchParams.get('until');
    if (until) query = query.lte('occurred_at', until);
    const { data: convs, error } = await query;
    if (error) throw new Error(`listar conversas: ${error.message}`);
    const leadIds = [...new Set((convs ?? []).map((c: { kommo_lead_id: string }) => c.kommo_lead_id))].slice(0, sample);

    const leads = [];
    for (const id of leadIds) leads.push(await auditLead(supabase, id));

    const classification: Record<string, number> = {};
    for (const l of leads) for (const [k, v] of Object.entries(l.classification)) classification[k] = (classification[k] ?? 0) + v;

    return json({
      ok: true,
      summary: {
        leads: leads.length,
        kommo_messages: leads.reduce((s, l) => s + l.kommo_total, 0),
        stored_messages: leads.reduce((s, l) => s + l.stored_total, 0),
        missing_in_db: leads.reduce((s, l) => s + l.missing_in_db.length, 0),
        text_available: leads.reduce((s, l) => s + l.text_available, 0),
        placeholders_outgoing: leads.reduce((s, l) => s + l.placeholders_outgoing, 0),
        placeholders_incoming_webhook_lost: leads.reduce((s, l) => s + l.placeholders_incoming_webhook_lost, 0),
        sender_mismatch: leads.reduce((s, l) => s + l.sender_mismatch.length, 0),
        timestamp_mismatch: leads.reduce((s, l) => s + l.timestamp_mismatch.length, 0),
        order_mismatch_leads: leads.filter((l) => !l.order_matches).map((l) => l.lead_id),
        classification,
      },
      leads,
    });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
