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

-- ---------------------------------------------------------------------------------------------
-- Sign in a TV (or any device without a keyboard) with a phone: QR code + short code.
-- The TV creates a link (public key), the phone signs in and approves by sending the session
-- ENCRYPTED to that key; only the TV can read it. No table access for clients: functions only.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.device_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tv_key text not null,
  phone_key text,
  payload text,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.device_links enable row level security; -- no policies on purpose

create or replace function public.link_create(p_code text, p_key text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  delete from public.device_links where created_at < now() - interval '15 minutes';
  if length(p_code) < 6 or length(p_code) > 16 or length(p_key) > 400 then raise exception 'bad_request'; end if;
  insert into public.device_links (code, tv_key) values (upper(p_code), p_key) returning id into v;
  return v;
end $$;

-- TV polls with the unguessable id until the phone has approved
create or replace function public.link_poll(p_id uuid) returns table (phone_key text, payload text)
language sql security definer set search_path = public as $$
  select phone_key, payload from public.device_links
  where id = p_id and payload is not null and created_at > now() - interval '15 minutes';
$$;

create or replace function public.link_finish(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.device_links where id = p_id;
$$;

-- phone (signed in) looks up the TV's public key for a code
create or replace function public.link_lookup(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select tv_key into k from public.device_links
   where code = upper(p_code) and payload is null and created_at > now() - interval '10 minutes';
  if k is null then raise exception 'link_not_found'; end if;
  return k;
end $$;

create or replace function public.link_approve(p_code text, p_phone_key text, p_payload text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(p_payload) > 8000 then raise exception 'bad_request'; end if;
  update public.device_links set phone_key = p_phone_key, payload = p_payload, user_id = auth.uid()
   where code = upper(p_code) and payload is null and created_at > now() - interval '10 minutes';
  if not found then raise exception 'link_not_found'; end if;
end $$;

revoke all on function public.link_create(text, text), public.link_poll(uuid), public.link_finish(uuid), public.link_lookup(text), public.link_approve(text, text, text) from public;
grant execute on function public.link_create(text, text), public.link_poll(uuid), public.link_finish(uuid) to anon, authenticated;
grant execute on function public.link_lookup(text), public.link_approve(text, text, text) to authenticated;
