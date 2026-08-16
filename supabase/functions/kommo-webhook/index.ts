import { createClient } from 'jsr:@supabase/supabase-js@2';
import { fetchLead } from '../_shared/kommo.ts';

/**
 * Webhooks do Kommo chegam form-urlencoded com notação de colchetes
 * (ex: "message[add][0][chat_id]=123"), não JSON. Reconstrói o objeto aninhado
 * para ficar legível quando inspecionarmos o payload staged no banco.
 */
function parseBracketForm(body: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const params = new URLSearchParams(body);
  for (const [rawKey, value] of params.entries()) {
    const segments: string[] = [];
    const re = /([^[\]]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rawKey)) !== null) segments.push(m[1]);
    // deno-lint-ignore no-explicit-any
    let node: any = root;
    segments.forEach((seg, i) => {
      const isLast = i === segments.length - 1;
      const nextSeg = segments[i + 1];
      const nextIsArrayIndex = nextSeg !== undefined && /^\d+$/.test(nextSeg);
      if (isLast) {
        node[seg] = value;
      } else {
        if (node[seg] === undefined) node[seg] = nextIsArrayIndex ? [] : {};
        node = node[seg];
      }
    });
  }
  return root;
}

interface KommoMessage {
  id: string;
  text: string;
  type: 'incoming' | 'outgoing';
  author: { id: string; name: string; type: string };
  chat_id: string;
  entity_id: string;
  entity_type: string;
  created_at: string;
}

/** Resolve o vendedor responsável pelo lead da mensagem — cacheado por request para não repetir a chamada ao Kommo. */
async function resolveSellerId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  leadCache: Map<string, string | null>,
  entityId: string
): Promise<string | null> {
  if (leadCache.has(entityId)) return leadCache.get(entityId)!;
  let sellerId: string | null = null;
  try {
    const lead = await fetchLead(entityId);
    const { data } = await supabase
      .from('sellers')
      .select('id')
      .eq('kommo_user_id', String(lead.responsible_user_id))
      .maybeSingle();
    sellerId = data?.id ?? null;
  } catch (err) {
    console.error(`failed to resolve seller for lead ${entityId}`, err);
  }
  leadCache.set(entityId, sellerId);
  return sellerId;
}

// deno-lint-ignore no-explicit-any
async function processMessage(supabase: any, leadCache: Map<string, string | null>, msg: KommoMessage) {
  if (msg.entity_type !== 'lead' || !msg.chat_id || !msg.text) return;

  const externalConversationId = `kommo:${msg.chat_id}`;
  const sentAt = new Date(Number(msg.created_at) * 1000).toISOString();
  const sender = (msg.type === 'outgoing' || msg.author?.type === 'user') ? 'seller' : 'client';

  const { data: existing } = await supabase
    .from('conversations')
    .select('id, occurred_at')
    .eq('external_id', externalConversationId)
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    conversationId = existing.id;
    if (new Date(sentAt) > new Date(existing.occurred_at)) {
      await supabase.from('conversations').update({ occurred_at: sentAt }).eq('id', conversationId);
    }
  } else {
    const sellerId = await resolveSellerId(supabase, leadCache, msg.entity_id);
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        external_id: externalConversationId,
        seller_id: sellerId,
        client_name: msg.type === 'incoming' ? msg.author.name : 'Cliente',
        occurred_at: sentAt,
        raw_payload: msg,
      })
      .select('id')
      .single();
    if (error) throw new Error(`criar conversation: ${error.message}`);
    conversationId = created.id;
  }

  const { error: msgError } = await supabase.from('conversation_messages').upsert(
    {
      external_id: msg.id,
      conversation_id: conversationId,
      sender,
      message: msg.text,
      sent_at: sentAt,
    },
    { onConflict: 'external_id' }
  );
  if (msgError) throw new Error(`gravar conversation_message: ${msgError.message}`);

  const { count } = await supabase
    .from('conversation_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  await supabase.from('conversations').update({ messages_count: count ?? 0 }).eq('id', conversationId);
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

  const rawText = await req.text();
  const contentType = req.headers.get('content-type') ?? '';

  let payload: unknown;
  try {
    payload = contentType.includes('application/json') ? JSON.parse(rawText) : parseBracketForm(rawText);
  } catch {
    payload = { raw: rawText };
  }

  const { data: eventRow, error: insertError } = await supabase
    .from('kommo_webhook_events')
    .insert({ payload })
    .select('id')
    .single();

  if (insertError) {
    console.error('failed to stage kommo webhook event', insertError);
    return new Response('ok', { status: 200 });
  }

  try {
    const messages = ((payload as Record<string, unknown>)?.message as Record<string, unknown> | undefined)
      ?.add as KommoMessage[] | undefined;
    if (messages?.length) {
      const leadCache = new Map<string, string | null>();
      for (const msg of messages) {
        await processMessage(supabase, leadCache, msg);
      }
    }
    await supabase.from('kommo_webhook_events').update({ processed: true }).eq('id', eventRow.id);
  } catch (err) {
    console.error('failed to process kommo webhook event', err);
    await supabase.from('kommo_webhook_events').update({ error: String(err) }).eq('id', eventRow.id);
  }

  return new Response('ok', { status: 200 });
});
