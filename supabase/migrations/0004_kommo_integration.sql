-- Integração com Kommo — usuários (vendedores) sincronizados para mapeamento manual,
-- vínculo em sellers, e staging de webhooks (mesmo padrão do MercadoPhone).

create table if not exists kommo_users (
  id text primary key,
  name text not null,
  email text,
  synced_at timestamptz not null default now()
);

alter table sellers add column if not exists kommo_user_id text references kommo_users(id) on delete set null;
create unique index if not exists idx_sellers_kommo_user_id on sellers(kommo_user_id) where kommo_user_id is not null;

create table if not exists kommo_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  error text
);

alter table kommo_users enable row level security;
alter table kommo_webhook_events enable row level security;

create policy "authenticated_full_access" on kommo_users
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on kommo_webhook_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
