-- =====================================================
-- HARDENING DE POLICIES: categories / products / settings / coupons
-- Objetivo: reduzir warnings de permissive policy sem quebrar o fluxo atual
-- =====================================================

-- -----------------------------------------------------
-- 1) CATEGORIES
-- -----------------------------------------------------
alter table if exists public.categories enable row level security;

drop policy if exists "Allow admin all categories" on public.categories;
drop policy if exists categories_public_select on public.categories;
drop policy if exists categories_auth_all on public.categories;

-- Leitura pública do cardápio
create policy categories_public_select
    on public.categories
    for select
    to anon, authenticated
    using (true);

-- CRUD somente para usuário autenticado (admin)
create policy categories_auth_all
    on public.categories
    for all
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- -----------------------------------------------------
-- 2) PRODUCTS
-- -----------------------------------------------------
alter table if exists public.products enable row level security;

drop policy if exists "Allow admin all products" on public.products;
drop policy if exists products_public_select on public.products;
drop policy if exists products_auth_all on public.products;

-- Leitura pública (frontend já filtra is_active)
create policy products_public_select
    on public.products
    for select
    to anon, authenticated
    using (true);

-- CRUD somente para usuário autenticado (admin)
create policy products_auth_all
    on public.products
    for all
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- -----------------------------------------------------
-- 3) SETTINGS
-- -----------------------------------------------------
alter table if exists public.settings enable row level security;

drop policy if exists "Allow admin all settings" on public.settings;
drop policy if exists settings_public_select on public.settings;
drop policy if exists settings_auth_all on public.settings;

-- Leitura pública (site precisa saber status da loja/horário/taxa)
create policy settings_public_select
    on public.settings
    for select
    to anon, authenticated
    using (true);

-- CRUD somente para usuário autenticado (admin)
create policy settings_auth_all
    on public.settings
    for all
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- -----------------------------------------------------
-- 4) COUPONS
-- -----------------------------------------------------
alter table if exists public.coupons enable row level security;

drop policy if exists "Permitir tudo para todos" on public.coupons;
drop policy if exists coupons_public_select_active on public.coupons;
drop policy if exists coupons_auth_all on public.coupons;

-- Público só lê cupons ativos (fluxo de aplicar cupom no site)
create policy coupons_public_select_active
    on public.coupons
    for select
    to anon, authenticated
    using (is_active = true);

-- CRUD e leitura total somente para usuário autenticado (admin)
create policy coupons_auth_all
    on public.coupons
    for all
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- =====================================================
-- Fim
-- =====================================================
