-- Leen sync: one row per user. Run once in Supabase > SQL Editor. Safe to re-run.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data text not null,
  updated_at timestamptz not null default now(),
  version int not null default 1
);

alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "user_data_insert_own" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "user_data_update_own" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_data_delete_own" on public.user_data for delete to authenticated using (auth.uid() = user_id);

-- Auth > Providers > Email: keep "Enable Email provider" on. For the 6-digit code flow, edit
-- Auth > Email Templates > Magic Link and put {{ .Token }} in the body (otherwise only a link is sent).
