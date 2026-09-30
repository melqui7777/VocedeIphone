-- Consistência da transcrição do Kommo: rastreabilidade total por mensagem, ordenação
-- estável, remetentes bot/sistema, agrupamento por lead + chat e ingestão atômica.

-- ============================================================
-- conversations — identificadores do Kommo
-- ============================================================
alter table conversations add column if not exists kommo_lead_id text;
alter table conversations add column if not exists kommo_chat_id text;
alter table conversations add column if not exists kommo_contact_id text;

create index if not exists idx_conversations_kommo_lead_id on conversations(kommo_lead_id);
create index if not exists idx_conversations_kommo_chat_id on conversations(kommo_chat_id);

-- Conversas antigas eram agrupadas só por chat ("kommo:<chat_id>"), o que misturava leads
-- diferentes do mesmo chat. Migra a chave para lead + chat usando o payload da 1ª mensagem.
update conversations
set
  external_id = 'kommo:lead:' || (raw_payload->>'entity_id') || ':chat:' || (raw_payload->>'chat_id'),
  kommo_lead_id = raw_payload->>'entity_id',
  kommo_chat_id = raw_payload->>'chat_id',
  kommo_contact_id = nullif(raw_payload->>'contact_id', '')
where external_id like 'kommo:%'
  and external_id not like 'kommo:lead:%'
  and raw_payload->>'entity_type' = 'lead'
  and coalesce(raw_payload->>'entity_id', '') <> ''
  and coalesce(raw_payload->>'chat_id', '') <> '';

-- ============================================================
-- conversation_messages — campos de rastreabilidade
-- ============================================================
alter table conversation_messages drop constraint if exists conversation_messages_sender_check;
alter table conversation_messages
  add constraint conversation_messages_sender_check check (sender in ('client', 'seller', 'bot', 'system'));

alter table conversation_messages add column if not exists sender_id text;
alter table conversation_messages add column if not exists sender_name text;
alter table conversation_messages add column if not exists message_type text not null default 'text';
alter table conversation_messages add column if not exists direction text check (direction in ('incoming', 'outgoing'));
alter table conversation_messages add column if not exists kommo_chat_id text;
alter table conversation_messages add column if not exists kommo_talk_id text;
alter table conversation_messages add column if not exists kommo_lead_id text;
alter table conversation_messages add column if not exists kommo_contact_id text;
alter table conversation_messages add column if not exists kommo_entity_type text;
alter table conversation_messages add column if not exists kommo_entity_id text;
alter table conversation_messages add column if not exists kommo_event_id uuid references kommo_webhook_events(id) on delete set null;
-- created_at exatamente como veio do Kommo (unix em segundos). sent_at é o valor normalizado (UTC).
alter table conversation_messages add column if not exists created_at_original text;
alter table conversation_messages add column if not exists timestamp_valid boolean not null default true;
alter table conversation_messages add column if not exists raw_payload jsonb;
alter table conversation_messages add column if not exists updated_at timestamptz not null default now();
-- Desempate estável: o created_at do Kommo tem resolução de segundos, então mensagens do mesmo
-- segundo são ordenadas pela ordem em que chegaram (sequência monotônica do banco).
alter table conversation_messages add column if not exists received_seq bigserial;

create index if not exists idx_conversation_messages_timeline
  on conversation_messages(conversation_id, sent_at, received_seq);
create index if not exists idx_conversation_messages_kommo_lead_id on conversation_messages(kommo_lead_id);
create index if not exists idx_conversation_messages_kommo_event_id
  on conversation_messages(kommo_event_id) where kommo_event_id is not null;

-- ============================================================
-- kommo_webhook_events — resultado do processamento para auditoria
-- ============================================================
alter table kommo_webhook_events add column if not exists processed_at timestamptz;
alter table kommo_webhook_events add column if not exists result jsonb;
-- Corpo HTTP exatamente como chegou (o payload jsonb é a versão já parseada).
alter table kommo_webhook_events add column if not exists raw_body text;

-- ============================================================
-- kommo_ingest_message — grava conversa + mensagem numa única transação.
--
-- * Upsert da conversa por external_id: elimina a corrida de dois webhooks simultâneos
--   criando a mesma conversa (antes um deles falhava e a mensagem se perdia).
-- * O lock da linha da conversa serializa as ingestões da mesma conversa, então a
--   recontagem de messages_count é sempre consistente.
-- * Mensagem idempotente por external_id (id da mensagem no Kommo): reentrega do mesmo
--   webhook não duplica; campos derivados só são reescritos se mudaram (reprocessamento),
--   e o raw_payload original é preservado.
-- ============================================================
create or replace function kommo_ingest_message(
  p_conversation_key text,
  p_seller_id uuid,
  p_client_name text,
  p_message jsonb,
  p_event_id uuid default null
) returns jsonb
language plpgsql
as $$
declare
  v_sent_at timestamptz := (p_message->>'sent_at')::timestamptz;
  v_conversation_id uuid;
  v_previous_conversation_id uuid;
  v_message_row_id uuid;
  v_inserted boolean;
  v_status text;
begin
  insert into conversations (
    external_id, seller_id, client_name, occurred_at, raw_payload,
    kommo_lead_id, kommo_chat_id, kommo_contact_id
  ) values (
    p_conversation_key, p_seller_id, coalesce(p_client_name, 'Cliente'), v_sent_at, p_message->'raw_payload',
    p_message->>'kommo_lead_id', p_message->>'kommo_chat_id', p_message->>'kommo_contact_id'
  )
  on conflict (external_id) do update set
    seller_id = coalesce(conversations.seller_id, excluded.seller_id),
    client_name = case
      when conversations.client_name = 'Cliente' and p_client_name is not null then p_client_name
      else conversations.client_name
    end,
    occurred_at = greatest(conversations.occurred_at, excluded.occurred_at),
    kommo_lead_id = coalesce(conversations.kommo_lead_id, excluded.kommo_lead_id),
    kommo_chat_id = coalesce(conversations.kommo_chat_id, excluded.kommo_chat_id),
    kommo_contact_id = coalesce(conversations.kommo_contact_id, excluded.kommo_contact_id)
  returning id into v_conversation_id;

  select conversation_id into v_previous_conversation_id
  from conversation_messages
  where external_id = p_message->>'kommo_message_id';

  insert into conversation_messages as cm (
    external_id, conversation_id, sender, sender_id, sender_name, message, message_type, direction,
    sent_at, created_at_original, timestamp_valid,
    kommo_chat_id, kommo_talk_id, kommo_lead_id, kommo_contact_id, kommo_entity_type, kommo_entity_id,
    kommo_event_id, raw_payload
  ) values (
    p_message->>'kommo_message_id', v_conversation_id, p_message->>'sender_type', p_message->>'sender_id',
    p_message->>'sender_name', coalesce(p_message->>'message_text', ''), coalesce(p_message->>'message_type', 'text'),
    p_message->>'direction', v_sent_at, p_message->>'created_at_original',
    coalesce((p_message->>'timestamp_valid')::boolean, true),
    p_message->>'kommo_chat_id', p_message->>'kommo_talk_id', p_message->>'kommo_lead_id',
    p_message->>'kommo_contact_id', p_message->>'kommo_entity_type', p_message->>'kommo_entity_id',
    p_event_id, p_message->'raw_payload'
  )
  on conflict (external_id) do update set
    conversation_id = excluded.conversation_id,
    sender = excluded.sender,
    sender_id = excluded.sender_id,
    sender_name = excluded.sender_name,
    message = excluded.message,
    message_type = excluded.message_type,
    direction = excluded.direction,
    -- Horário válido do Kommo sempre vence; nunca é trocado pelo horário de recebimento (fallback);
    -- entre dois fallbacks fica o mais antigo, para a mensagem não "andar" na timeline em reentregas.
    sent_at = case
      when excluded.timestamp_valid then excluded.sent_at
      when cm.timestamp_valid then cm.sent_at
      else least(cm.sent_at, excluded.sent_at)
    end,
    created_at_original = case
      when excluded.timestamp_valid then excluded.created_at_original
      when cm.timestamp_valid then cm.created_at_original
      else coalesce(cm.created_at_original, excluded.created_at_original)
    end,
    timestamp_valid = cm.timestamp_valid or excluded.timestamp_valid,
    kommo_chat_id = excluded.kommo_chat_id,
    kommo_talk_id = excluded.kommo_talk_id,
    kommo_lead_id = excluded.kommo_lead_id,
    kommo_contact_id = excluded.kommo_contact_id,
    kommo_entity_type = excluded.kommo_entity_type,
    kommo_entity_id = excluded.kommo_entity_id,
    kommo_event_id = coalesce(cm.kommo_event_id, excluded.kommo_event_id),
    raw_payload = coalesce(cm.raw_payload, excluded.raw_payload),
    updated_at = now()
  where (cm.conversation_id, cm.sender, cm.sender_id, cm.sender_name, cm.message, cm.message_type, cm.direction,
         cm.kommo_chat_id, cm.kommo_talk_id, cm.kommo_lead_id, cm.kommo_contact_id, cm.kommo_entity_type,
         cm.kommo_entity_id, cm.raw_payload is null)
    is distinct from
        (excluded.conversation_id, excluded.sender, excluded.sender_id, excluded.sender_name, excluded.message,
         excluded.message_type, excluded.direction, excluded.kommo_chat_id, excluded.kommo_talk_id,
         excluded.kommo_lead_id, excluded.kommo_contact_id, excluded.kommo_entity_type, excluded.kommo_entity_id,
         false)
     or (excluded.timestamp_valid and (not cm.timestamp_valid or cm.sent_at <> excluded.sent_at))
  returning id, (xmax = 0) into v_message_row_id, v_inserted;

  if v_message_row_id is null then
    v_status := 'duplicate_ignored';
  elsif v_inserted then
    v_status := 'inserted';
  else
    v_status := 'updated';
  end if;

  update conversations c
  set messages_count = (select count(*) from conversation_messages m where m.conversation_id = c.id)
  where c.id = v_conversation_id
     or (v_previous_conversation_id is not null and c.id = v_previous_conversation_id);

  return jsonb_build_object(
    'status', v_status,
    'conversation_id', v_conversation_id,
    'previous_conversation_id', v_previous_conversation_id
  );
end;
$$;

-- Só o backend (service_role) pode ingerir mensagens.
revoke all on function kommo_ingest_message(text, uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function kommo_ingest_message(text, uuid, text, jsonb, uuid) to service_role;

-- ============================================================
-- kommo_delete_empty_conversations — limpeza pós-reprocessamento.
-- Usa a existência real de mensagens (não messages_count, que pode estar desatualizado
-- em dados legados) e preserva conversas que já têm análise.
-- ============================================================
create or replace function kommo_delete_empty_conversations() returns integer
language sql
as $$
  with deleted as (
    delete from conversations c
    where c.external_id like 'kommo:%'
      and c.summary is null
      and c.result_type is null
      and c.score is null
      and not exists (select 1 from conversation_messages m where m.conversation_id = c.id)
    returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke all on function kommo_delete_empty_conversations() from public, anon, authenticated;
grant execute on function kommo_delete_empty_conversations() to service_role;
