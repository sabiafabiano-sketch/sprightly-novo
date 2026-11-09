create table if not exists public.finance_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"entries": [], "budgets": {}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finance_data enable row level security;

revoke all on public.finance_data from anon;
grant select, insert, update on public.finance_data to authenticated;

drop policy if exists "Users can read own finance data" on public.finance_data;
create policy "Users can read own finance data"
  on public.finance_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own finance data" on public.finance_data;
create policy "Users can insert own finance data"
  on public.finance_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own finance data" on public.finance_data;
create policy "Users can update own finance data"
  on public.finance_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
