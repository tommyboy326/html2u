-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- Safe to re-run.

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.shares (
  id            text primary key,
  mode          text not null check (mode in ('link', 'password', 'magic')),
  html          text not null,
  password_hash text,
  magic_token   text,
  one_time      boolean not null default false,
  allow_external boolean not null default false,
  consumed_at   timestamptz,
  title         text,
  views         integer not null default 0,
  reports       integer not null default 0,
  created_ip    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create index if not exists shares_expires_at_idx on public.shares (expires_at);
create index if not exists shares_created_at_idx on public.shares (created_at desc);

create table if not exists public.rate_limits (
  bucket     text primary key,
  count      integer not null default 0,
  expires_at timestamptz not null
);

-- =========================================================================
-- Row Level Security
-- Enable RLS with NO policies => anon / authenticated roles are denied all
-- access. Our server uses the service_role key, which bypasses RLS. Never use
-- the anon key against these tables.
-- =========================================================================

alter table public.shares enable row level security;
alter table public.rate_limits enable row level security;

-- =========================================================================
-- Functions (SECURITY DEFINER so they operate on the tables regardless of role)
-- =========================================================================

-- Atomic one-time consumption of a magic link. Returns the row only if the
-- token matches, it hasn't expired, and (for one-time links) wasn't used yet.
create or replace function public.consume_share(p_id text, p_token text)
returns setof public.shares
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.shares
     set consumed_at = now(),
         views = views + 1
   where id = p_id
     and mode = 'magic'
     and magic_token = p_token
     and expires_at > now()
     and (one_time = false or consumed_at is null)
  returning *;
end;
$$;

create or replace function public.incr_views(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.shares set views = views + 1 where id = p_id;
$$;

create or replace function public.report_share(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.shares set reports = reports + 1 where id = p_id;
$$;

-- Fixed-window rate limit counter. Returns the current count in the window.
create or replace function public.incr_rate(p_bucket text, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  c int;
begin
  insert into public.rate_limits (bucket, count, expires_at)
       values (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
       set count = case when public.rate_limits.expires_at < now() then 1
                        else public.rate_limits.count + 1 end,
           expires_at = case when public.rate_limits.expires_at < now()
                        then now() + make_interval(secs => p_window_seconds)
                        else public.rate_limits.expires_at end
  returning count into c;
  return c;
end;
$$;

-- =========================================================================
-- Auto-cleanup of expired rows (pg_cron).
-- In Supabase: Dashboard → Database → Extensions → enable "pg_cron" first.
-- Reads already filter on expires_at, so this is just housekeeping.
-- =========================================================================

-- create extension if not exists pg_cron;
-- select cron.schedule('cleanup_shares',      '0 * * * *',  $$delete from public.shares      where expires_at < now()$$);
-- select cron.schedule('cleanup_rate_limits', '*/30 * * * *', $$delete from public.rate_limits where expires_at < now()$$);
