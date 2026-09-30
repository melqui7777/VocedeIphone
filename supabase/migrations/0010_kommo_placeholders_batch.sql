-- Inserção de marcadores em lote: um lead com histórico longo gerava milhares de chamadas RPC
-- sequenciais e estourava o limite de 150s da Edge Function. Mesma semântica de
-- kommo_insert_event_placeholder, aplicada a um array, numa única ida ao banco.
create or replace function kommo_insert_event_placeholders(p_messages jsonb) returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_result text;
  v_inserted integer := 0;
  v_exists integer := 0;
  v_not_found integer := 0;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    v_result := kommo_insert_event_placeholder(v_item);
    if v_result = 'inserted' then
      v_inserted := v_inserted + 1;
    elsif v_result = 'conversation_not_found' then
      v_not_found := v_not_found + 1;
    else
      v_exists := v_exists + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'exists', v_exists, 'not_found', v_not_found);
end;
$$;

revoke all on function kommo_insert_event_placeholders(jsonb) from public, anon, authenticated;
grant execute on function kommo_insert_event_placeholders(jsonb) to service_role;
