-- Controle manual de quais vendedores aparecem no ranking (independente do sync com o MercadoPhone).

alter table sellers add column if not exists show_in_ranking boolean not null default true;
