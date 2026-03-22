create table if not exists public.push_subscriptions (
    token text primary key,
    user_id uuid null references auth.users(id) on delete set null,
    role text not null default 'kds',
    user_agent text null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_role_active
    on public.push_subscriptions (role, is_active);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select
    on public.push_subscriptions
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert
    on public.push_subscriptions
    for insert
    to authenticated
    with check (
        auth.uid() = user_id
        and role in ('kds', 'admin')
        and token is not null
        and length(token) > 20
    );

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update
    on public.push_subscriptions
    for update
    to authenticated
    using (
        auth.uid() = user_id
    )
    with check (
        auth.uid() = user_id
        and role in ('kds', 'admin')
        and token is not null
        and length(token) > 20
    );
