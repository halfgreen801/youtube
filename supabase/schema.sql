create table if not exists public.tube_vault_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tube_vault_states enable row level security;

drop policy if exists "Users can select own tube vault state" on public.tube_vault_states;
create policy "Users can select own tube vault state"
on public.tube_vault_states
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own tube vault state" on public.tube_vault_states;
create policy "Users can insert own tube vault state"
on public.tube_vault_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own tube vault state" on public.tube_vault_states;
create policy "Users can update own tube vault state"
on public.tube_vault_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own tube vault state" on public.tube_vault_states;
create policy "Users can delete own tube vault state"
on public.tube_vault_states
for delete
to authenticated
using ((select auth.uid()) = user_id);
