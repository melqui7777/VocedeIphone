-- Integração com MercadoPhone — colunas de idempotência + staging de webhooks.

alter table sellers add column if not exists external_id text unique;
alter table products add column if not exists external_id text unique;
alter table sales add column if not exists external_id text unique;

create table if not exists mercadophone_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  error text
);

alter table mercadophone_webhook_events enable row level security;

create policy "authenticated_full_access" on mercadophone_webhook_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create extension if not exists pg_cron;
create extension if not exists pg_net;
