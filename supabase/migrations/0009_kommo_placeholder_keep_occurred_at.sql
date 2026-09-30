-- Marcadores (mensagens conhecidas só pela events API) não devem adiantar conversations.occurred_at,
-- que os relatórios usam para agrupar a conversa por dia. Mesma função da 0008, sem esse efeito.

create or replace function kommo_insert_event_placeholder(p_message jsonb) returns text
language plpgsql
as $$
declare
  v_conversation_id uuid := (p_message->>'conversation_id')::uuid;
  v_sent_at timestamptz := (p_message->>'sent_at')::timestamptz;
  v_id uuid;
begin
  -- Mesmo lock da ingestão do webhook: serializa gravações da mesma conversa e mantém a contagem certa.
  perform 1 from conversations where id = v_conversation_id for update;
  if not found then
    return 'conversation_not_found';
  end if;

  insert into conversation_messages (
    external_id, conversation_id, sender, sender_id, sender_name, message, message_type, direction,
    sent_at, created_at_original, timestamp_valid, kommo_talk_id, kommo_chat_id, kommo_lead_id,
    kommo_contact_id, kommo_entity_type, kommo_entity_id, source_event
  )
  select
    p_message->>'kommo_message_id', c.id, p_message->>'sender_type', p_message->>'sender_id',
    p_message->>'sender_name', '', 'unavailable', p_message->>'direction',
    v_sent_at, p_message->>'created_at_original', true, p_message->>'kommo_talk_id', c.kommo_chat_id,
    c.kommo_lead_id, c.kommo_contact_id, case when c.kommo_lead_id is not null then 'lead' end, c.kommo_lead_id,
    p_message->'source_event'
  from conversations c
  where c.id = v_conversation_id
  on conflict (external_id) do nothing
  returning id into v_id;

  if v_id is null then
    return 'exists';
  end if;

  -- occurred_at não é alterado: continua refletindo a última mensagem real (relatórios agrupam por ele).
  update conversations c
  set messages_count = (select count(*) from conversation_messages m where m.conversation_id = c.id)
  where c.id = v_conversation_id;

  return 'inserted';
end;
$$;

