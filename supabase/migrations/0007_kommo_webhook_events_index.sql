-- O kommo-reprocess percorre kommo_webhook_events por (received_at, id); sem índice a
-- ordenação faz seq scan na tabela inteira e estoura o statement timeout.
create index if not exists idx_kommo_webhook_events_received
  on kommo_webhook_events(received_at, id);
create index if not exists idx_kommo_webhook_events_pending
  on kommo_webhook_events(received_at, id) where processed = false;
