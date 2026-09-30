import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseBracketForm } from '../_shared/kommoMessage.ts';
import { createIngestContext, ingestWebhookPayload, summarizeOutcomes } from '../_shared/kommoIngest.ts';

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

  const receivedAt = new Date();
  const rawText = await req.text();
  const contentType = req.headers.get('content-type') ?? '';

  let payload: unknown;
  try {
    payload = contentType.includes('application/json') ? JSON.parse(rawText) : parseBracketForm(rawText);
  } catch {
    payload = { raw: rawText };
  }

  // O payload bruto é sempre gravado antes de processar — é a fonte para auditoria e para o kommo-reprocess.
  const { data: eventRow, error: insertError } = await supabase
    .from('kommo_webhook_events')
    .insert({ payload, raw_body: rawText, received_at: receivedAt.toISOString() })
    .select('id')
    .single();

  if (insertError) {
    console.error('failed to stage kommo webhook event', insertError);
    // Sem staging não há como reprocessar depois: pede para o Kommo reenviar.
    return new Response('staging failed', { status: 500 });
  }

  const outcomes = await ingestWebhookPayload(createIngestContext(supabase), payload, eventRow.id, receivedAt);
  const summary = summarizeOutcomes(outcomes);
  const failed = outcomes.filter((o) => o.status === 'error');
  console.log(JSON.stringify({ kommo_event: eventRow.id, ...summary.counts }));

  await supabase
    .from('kommo_webhook_events')
    .update({
      processed: failed.length === 0,
      processed_at: new Date().toISOString(),
      result: summary,
      error: failed.length ? failed.map((f) => `${f.message_id}: ${f.reason}`).join('\n') : null,
    })
    .eq('id', eventRow.id);

  // Responde 200 mesmo com falha parcial: o evento fica com processed=false e é recuperado pelo kommo-reprocess.
  return new Response('ok', { status: 200 });
});
