-- =====================================================
-- FIXES PARA SUPABASE ADVISOR (SEM QUEBRAR O FLUXO ATUAL)
-- =====================================================

-- 1) ERROS: RLS desabilitado em tabelas com policies
alter table if exists public.customers enable row level security;
alter table if exists public.orders enable row level security;

-- -----------------------------------------------------
-- 2) Policies para ORDERS (checkout público + admin logado)
-- -----------------------------------------------------

drop policy if exists "Allow admin all orders" on public.orders;
drop policy if exists "Allow public insert orders" on public.orders;
drop policy if exists orders_admin_all on public.orders;
drop policy if exists orders_public_insert on public.orders;

create policy orders_public_insert
    on public.orders
    for insert
    to anon, authenticated
    with check (
        auth.role() in ('anon', 'authenticated')
        and status in ('pendente', 'preparando', 'pronto', 'entregue')
        and delivery_type in ('entrega', 'retirada')
    );

create policy orders_admin_all
    on public.orders
    for all
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- -----------------------------------------------------
-- 3) Policies para CUSTOMERS (fluxo público de perfil)
-- -----------------------------------------------------

drop policy if exists "Allow admin all customers" on public.customers;
drop policy if exists customers_public_select on public.customers;
drop policy if exists customers_public_insert on public.customers;
drop policy if exists customers_public_update on public.customers;
drop policy if exists customers_admin_all on public.customers;

create policy customers_public_select
    on public.customers
    for select
    to anon, authenticated
    using (true);

create policy customers_public_insert
    on public.customers
    for insert
    to anon, authenticated
    with check (
        auth.role() in ('anon', 'authenticated')
        and phone is not null
        and length(regexp_replace(phone, '\\D', '', 'g')) >= 10
    );

create policy customers_public_update
    on public.customers
    for update
    to anon, authenticated
    using (
        auth.role() in ('anon', 'authenticated')
    )
    with check (
        auth.role() in ('anon', 'authenticated')
        and phone is not null
        and length(regexp_replace(phone, '\\D', '', 'g')) >= 10
    );

create policy customers_admin_all
    on public.customers
    for all
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- -----------------------------------------------------
-- 4) WARNING: function_search_path_mutable
-- -----------------------------------------------------

do $$
declare
    fn record;
begin
    for fn in
        select
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as function_args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('get_customer_by_phone', 'get_my_orders')
    loop
        execute format(
            'alter function %I.%I(%s) set search_path = public, auth, pg_catalog;',
            fn.schema_name,
            fn.function_name,
            fn.function_args
        );
    end loop;
end $$;

-- -----------------------------------------------------
-- 5) NOTA
-- O warning de "Leaked Password Protection Disabled" é no painel Auth,
-- não via SQL. Ative em: Authentication > Settings > Password Security.
-- -----------------------------------------------------
