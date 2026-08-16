-- Evita duplicar mensagens quando o Kommo reentrega o mesmo webhook (retry).
alter table conversation_messages add column if not exists external_id text unique;
