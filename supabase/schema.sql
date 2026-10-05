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

-- Short-lived, per-device playback presence. This stays separate from encrypted account sync data.
create table if not exists public.playback_presence (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 100),
  device_name text not null check (length(device_name) <= 40),
  profile_name text not null check (length(profile_name) <= 100),
  item_id text not null check (length(item_id) <= 500),
  item_name text not null check (length(item_name) <= 500),
  item_kind text not null check (item_kind in ('live', 'movie', 'episode')),
  status text not null check (status in ('playing', 'paused')),
  position double precision not null default 0 check (position >= 0),
  duration double precision not null default 0 check (duration >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.playback_presence add column if not exists device_name text not null default 'Device';

alter table public.playback_presence enable row level security;
drop policy if exists "playback_presence_select_own" on public.playback_presence;
drop policy if exists "playback_presence_insert_own" on public.playback_presence;
drop policy if exists "playback_presence_update_own" on public.playback_presence;
drop policy if exists "playback_presence_delete_own" on public.playback_presence;
create policy "playback_presence_select_own" on public.playback_presence for select to authenticated using (auth.uid() = user_id);
create policy "playback_presence_insert_own" on public.playback_presence for insert to authenticated with check (auth.uid() = user_id);
create policy "playback_presence_update_own" on public.playback_presence for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "playback_presence_delete_own" on public.playback_presence for delete to authenticated using (auth.uid() = user_id);


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

-- ---------------------------------------------------------------------------------------------
-- Shared metadata cache: raw TMDB title / season responses, plus which TMDB id a cleaned title resolved to (/resolve/), read by every signed-in device before it
-- calls TMDB, so a title is fetched from TMDB once for everyone. Full provider responses (the provider is recorded per row). Public movie data only, never user
-- data or keys. Clients cannot write the table: they call meta_put(), which validates the row, stamps
-- the time on the server and refuses to replace a row that is younger than 7 days (so one bad client
-- cannot overwrite fresh data). `by` records who wrote a row, to clean up after a bad one.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.meta_cache (
  key text primary key check (key ~ '^tmdb:v[0-9]+:[A-Za-z-]{2,10}:(/(movie|tv)/[0-9]+(/season/[0-9]+)?|/resolve/(movie|series))\?' and length(key) <= 300),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2000000),
  fetched_at timestamptz not null default now(),
  "by" uuid default auth.uid(),
  provider text generated always as (split_part(key, ':', 1)) stored -- which metadata provider the row came from (the key prefix), so rows can be told apart or re-read if the provider changes
);
-- tables made before: full (untrimmed) responses are kept, so the size cap is 2 MB; record the provider; widen the key check for /resolve/ rows, which hold only an id
alter table public.meta_cache add column if not exists provider text generated always as (split_part(key, ':', 1)) stored;
alter table public.meta_cache drop constraint if exists meta_cache_data_check;
alter table public.meta_cache add constraint meta_cache_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2000000);
alter table public.meta_cache drop constraint if exists meta_cache_key_check;
alter table public.meta_cache add constraint meta_cache_key_check check (key ~ '^tmdb:v[0-9]+:[A-Za-z-]{2,10}:(/(movie|tv)/[0-9]+(/season/[0-9]+)?|/resolve/(movie|series))\?' and length(key) <= 300);
alter table public.meta_cache drop constraint if exists meta_cache_resolve_check;
alter table public.meta_cache add constraint meta_cache_resolve_check check (key !~ ':/resolve/' or (jsonb_typeof(data->'id') = 'number' and (data->>'id') ~ '^[1-9][0-9]{0,9}$' and data - 'id' = '{}'::jsonb));
alter table public.meta_cache enable row level security;
drop policy if exists "meta_cache_read" on public.meta_cache;
create policy "meta_cache_read" on public.meta_cache for select to authenticated using (true); -- no insert / update / delete policies on purpose

create or replace function public.meta_put(p_key text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.meta_cache as m (key, data, fetched_at, "by") values (p_key, p_data, now(), auth.uid())
  on conflict (key) do update set data = excluded.data, fetched_at = now(), "by" = auth.uid()
  where m.fetched_at < now() - interval '7 days';
end $$;

revoke all on function public.meta_put(text, jsonb) from public, anon;
grant execute on function public.meta_put(text, jsonb) to authenticated;
