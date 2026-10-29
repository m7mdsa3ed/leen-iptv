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
-- Shared metadata cache: raw TMDB title / season responses (and OMDb ratings responses, omdb:), plus which TMDB id a cleaned title resolved to (/resolve/), read by every signed-in device before it
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
alter table public.meta_cache add constraint meta_cache_key_check check ((key ~ '^tmdb:v[0-9]+:[A-Za-z-]{2,10}:(/(movie|tv)/[0-9]+(/season/[0-9]+)?|/resolve/(movie|series))\?' or key ~ '^omdb:v[0-9]+:any:/(id/tt[0-9]{5,10}|find/(movie|series))\?') and length(key) <= 300);
-- OMDb rows (ratings, by IMDb id or title): the response as OMDb sent it, found titles only
alter table public.meta_cache drop constraint if exists meta_cache_omdb_check;
alter table public.meta_cache add constraint meta_cache_omdb_check check (key !~ '^omdb:' or (data->>'Response' = 'True' and data->>'imdbID' ~ '^tt[0-9]{5,10}$' and pg_column_size(data) <= 20000));
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

-- ===== Unified metadata ("the vault") =====
-- One record per thing the app looks up, written by the app's metadata middleman: every device reads this row first and
-- only calls TMDB / OMDb / Plex / Watchmode on a miss. It is NOT a provider payload cache (that is meta_cache above):
-- it holds the already-merged answer the app shows, so it stays small.
-- Kinds, by the start of the key:
--   t<v>:<lang>:<movie|series>:<title>:<year>  one merged title (Meta)
--   s<v>:<lang>:<tmdb id>:<season>            one season's episodes
--   p<v>:<any>:<person id|name>               one person profile
--   a<v>:<region>:<kind>:<title>:<year>       where a title can be watched in one country
create table if not exists public.meta_vault (
  key text primary key check (key ~ '^[tspa][0-9]+:[a-z0-9]{2,5}:' and length(key) <= 300),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  fetched_at timestamptz not null default now(),
  "by" uuid default auth.uid()
);
-- an older table was titles only: widen its key check instead of keeping the narrow one
alter table public.meta_vault drop constraint if exists meta_vault_key_check;
alter table public.meta_vault add constraint meta_vault_key_check check (key ~ '^[tspa][0-9]+:[a-z0-9]{2,5}:' and length(key) <= 300);
-- rows written before a shape change are never read (the app bumps the version in the key)
create index if not exists meta_vault_fetched_at_idx on public.meta_vault (fetched_at desc);

-- Each kind validates on its own: a title record must say something about the title, a season must list episodes,
-- a person must have an object, and availability must be a list.
create or replace function public.meta_vault_ok(p_key text, p_data jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
begin
  if jsonb_typeof(p_data) <> 'object' then return false; end if;
  case split_part(p_key, ':', 1)
    when 't1' then
      return p_data ? 'ids' and jsonb_typeof(p_data->'ids') = 'object'
        and (jsonb_typeof(p_data->'cast') is null or jsonb_typeof(p_data->'cast') = 'array')
        and (jsonb_typeof(p_data->'plot') = 'string' or jsonb_array_length(coalesce(p_data->'cast', '[]'::jsonb)) > 0);
    when 's1' then
      return p_data ? 'eps' and jsonb_typeof(p_data->'eps') = 'array' and jsonb_array_length(p_data->'eps') > 0;
    when 'p1' then
      return p_data ? 'info' and jsonb_typeof(p_data->'info') = 'object' and p_data->'info' <> '{}'::jsonb;
    when 'a1' then
      return p_data ? 'avail' and jsonb_typeof(p_data->'avail') = 'array';
    else return false;
  end case;
end $$;

alter table public.meta_vault drop constraint if exists meta_vault_shape_check;
alter table public.meta_vault add constraint meta_vault_shape_check check (public.meta_vault_ok(key, data));

alter table public.meta_vault enable row level security;
drop policy if exists "meta_vault_read" on public.meta_vault;
create policy "meta_vault_read" on public.meta_vault for select to authenticated using (true); -- no insert / update / delete policies on purpose

-- Writes go through this function only: it validates the shape, stamps the time, and keeps a row younger than the TTL
-- (so a device that had older data does not overwrite a better record another one just merged).
create or replace function public.meta_vault_put(p_key text, p_data jsonb, p_ttl interval default interval '30 days') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not public.meta_vault_ok(p_key, p_data) then raise exception 'bad_meta_row'; end if;
  insert into public.meta_vault as m (key, data, fetched_at, "by") values (p_key, p_data, now(), auth.uid())
  on conflict (key) do update set data = excluded.data, fetched_at = now(), "by" = auth.uid()
  where m.fetched_at < now() - p_ttl;
end $$;

revoke all on function public.meta_vault_put(text, jsonb, interval) from public, anon;
grant execute on function public.meta_vault_put(text, jsonb, interval) to authenticated;
