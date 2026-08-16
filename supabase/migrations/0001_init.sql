-- Você de iPhone — schema inicial
-- Rodar no SQL Editor do Supabase (Project > SQL Editor).

create extension if not exists pgcrypto;

-- ============================================================
-- sellers
-- ============================================================
create table if not exists sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- products (estoque)
-- ============================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  brand text,
  category text not null check (category in ('Aparelhos', 'Acessórios')),
  location text,
  stock integer not null default 0,
  min_stock integer not null default 0,
  price numeric(10, 2) not null default 0,
  imei text,
  battery_health text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- sales
-- ============================================================
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers(id) on delete restrict,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null default 1,
  amount numeric(10, 2) not null,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_seller_id on sales(seller_id);
create index if not exists idx_sales_product_id on sales(product_id);
create index if not exists idx_sales_sold_at on sales(sold_at);

-- ============================================================
-- conversations (auditoria de conversas — schema pronto para
-- futura sincronização via API externa; ingestão em si é
-- fora do escopo desta etapa)
-- ============================================================
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  seller_id uuid references sellers(id) on delete set null,
  client_name text not null,
  occurred_at timestamptz not null default now(),
  product text,
  result text,
  result_type text check (result_type in ('success', 'loss')),
  summary text,
  key_points text[] not null default '{}',
  duration_seconds integer,
  messages_count integer,
  sentiment text,
  score numeric(3, 1),
  objections text,
  strengths text[] not null default '{}',
  improvements text[] not null default '{}',
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_seller_id on conversations(seller_id);
create index if not exists idx_conversations_occurred_at on conversations(occurred_at);

-- ============================================================
-- conversation_messages (transcrição do chat)
-- ============================================================
create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender text not null check (sender in ('client', 'seller')),
  message text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_messages_conversation_id on conversation_messages(conversation_id);

-- ============================================================
-- goals (linha única)
-- ============================================================
create table if not exists goals (
  id smallint primary key default 1 check (id = 1),
  weekly_devices_target integer not null default 1250,
  weekly_accessories_target integer not null default 3500,
  monthly_devices_target integer not null default 5000,
  monthly_accessories_target integer not null default 12000,
  updated_at timestamptz not null default now()
);

insert into goals (id)
values (1)
on conflict (id) do nothing;

-- ============================================================
-- panel_settings (linha única)
-- ============================================================
create table if not exists panel_settings (
  id smallint primary key default 1 check (id = 1),
  show_ranking boolean not null default true,
  show_goals boolean not null default true,
  show_products boolean not null default true,
  show_tv_panel boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into panel_settings (id)
values (1)
on conflict (id) do nothing;

-- ============================================================
-- RLS — acesso único ao papel "authenticated" (dono/gerente).
-- anon não tem nenhum acesso.
-- ============================================================
alter table sellers enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table goals enable row level security;
alter table panel_settings enable row level security;

create policy "authenticated_full_access" on sellers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on conversations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on conversation_messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on goals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_full_access" on panel_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
