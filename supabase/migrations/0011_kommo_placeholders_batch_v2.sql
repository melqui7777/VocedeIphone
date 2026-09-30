-- Lote de marcadores, versão 2 (substitui a 0010):
-- * trava as conversas envolvidas uma vez, em ordem de id, antes de inserir → sem deadlock entre
--   lotes concorrentes e com lock curto e previsível;
-- * insere na ordem do array por conversa (a ordem cronológica vem do planPlaceholders, e o
--   received_seq desempata o mesmo segundo);
-- * cada item roda num savepoint: um item malformado vira `failed` sem desfazer o lote;
-- * messages_count é recontado uma vez por conversa, no fim (antes era por item: O(n²)).
create or replace function kommo_insert_event_placeholders(p_messages jsonb) returns jsonb
language plpgsql
as $$
declare
  v_item record;
  v_id uuid;
  v_inserted integer := 0;
  v_exists integer := 0;
  v_not_found integer := 0;
  v_failed integer := 0;
  v_conversations uuid[];
begin
  -- Conversas existentes citadas no lote, travadas em ordem determinística.
  select coalesce(array_agg(c.id order by c.id), '{}') into v_conversations
  from (
    select c.id from conversations c
    where c.id in (
      select distinct (e.value->>'conversation_id')::uuid
      from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) e
      where (e.value->>'conversation_id') ~* '^[0-9a-f-]{36}$'
    )
    order by c.id
    for update
  ) c;

  for v_item in
    select e.value as m, e.ordinality as pos
    from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) with ordinality e
    order by e.ordinality
  loop
    begin
      if not ((v_item.m->>'conversation_id') ~* '^[0-9a-f-]{36}$')
         or not ((v_item.m->>'conversation_id')::uuid = any (v_conversations)) then
        v_not_found := v_not_found + 1;
        continue;
      end if;

      v_id := null;
      insert into conversation_messages (
        external_id, conversation_id, sender, sender_id, sender_name, message, message_type, direction,
        sent_at, created_at_original, timestamp_valid, kommo_talk_id, kommo_chat_id, kommo_lead_id,
        kommo_contact_id, kommo_entity_type, kommo_entity_id, source_event
      )
      select
        v_item.m->>'kommo_message_id', c.id, v_item.m->>'sender_type', v_item.m->>'sender_id',
        v_item.m->>'sender_name', '', 'unavailable', v_item.m->>'direction',
        (v_item.m->>'sent_at')::timestamptz, v_item.m->>'created_at_original', true, v_item.m->>'kommo_talk_id',
        c.kommo_chat_id, c.kommo_lead_id, c.kommo_contact_id,
        case when c.kommo_lead_id is not null then 'lead' end, c.kommo_lead_id, v_item.m->'source_event'
      from conversations c
      where c.id = (v_item.m->>'conversation_id')::uuid
      on conflict (external_id) do nothing
      returning id into v_id;

      if v_id is null then
        v_exists := v_exists + 1;
      else
        v_inserted := v_inserted + 1;
      end if;
    exception when others then
      -- Savepoint implícito do bloco: só este item é desfeito.
      v_failed := v_failed + 1;
      raise warning 'kommo_insert_event_placeholders: item % falhou: %', v_item.m->>'kommo_message_id', sqlerrm;
    end;
  end loop;

  update conversations c
  set messages_count = (select count(*) from conversation_messages m where m.conversation_id = c.id)
  where c.id = any (v_conversations);

  return jsonb_build_object('inserted', v_inserted, 'exists', v_exists, 'not_found', v_not_found, 'failed', v_failed);
end;
$$;

revoke all on function kommo_insert_event_placeholders(jsonb) from public, anon, authenticated;
grant execute on function kommo_insert_event_placeholders(jsonb) to service_role;
