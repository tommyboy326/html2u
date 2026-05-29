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

-- CSP violation reports. Created here (minimal, forward-compatible) so the
-- cleanup_csp_violations cron job below references a real table from day one.
-- SEC-03 (Phase 3) owns the full ingest schema and will ALTER/extend this table
-- (e.g. unique constraint on the dedup key, NOT NULL tightening). Keep additive.
-- Dedup key (SEC-03): (document_uri_path, directive, blocked_host, source_host).
create table if not exists public.csp_violations (
  id                bigint generated always as identity primary key,
  document_uri_path text,
  directive         text,
  blocked_host      text,
  source_host       text,
  count             integer not null default 1,
  created_at        timestamptz not null default now()
);

-- Index for the 30-day TTL cleanup job's WHERE clause (created_at < cutoff).
create index if not exists csp_violations_created_at_idx on public.csp_violations (created_at);

-- =========================================================================
-- Row Level Security
-- Enable RLS with NO policies => anon / authenticated roles are denied all
-- access. Our server uses the service_role key, which bypasses RLS. Never use
-- the anon key against these tables.
-- =========================================================================

alter table public.shares enable row level security;
alter table public.rate_limits enable row level security;
alter table public.csp_violations enable row level security;

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
-- The statement below self-enables the pg_cron extension. In Supabase, if the
-- SQL editor lacks privileges to create the extension, enable "pg_cron" first
-- under Dashboard → Database → Extensions, then re-run this file.
-- Reads already filter on expires_at, so the shares/rate_limits jobs are just
-- housekeeping; the csp_violations job enforces the 30-day retention promised
-- by the legal pages (SEC-04).
-- Idempotent: `cron.schedule` is upsert-like by job name — re-running this file
-- updates the existing job in place rather than creating duplicates.
-- =========================================================================

create extension if not exists pg_cron;
select cron.schedule('cleanup_shares',          '0 * * * *',   $$delete from public.shares         where expires_at < now()$$);
select cron.schedule('cleanup_rate_limits',     '*/30 * * * *', $$delete from public.rate_limits    where expires_at < now()$$);
select cron.schedule('cleanup_csp_violations',  '0 3 * * *',   $$delete from public.csp_violations where created_at < now() - interval '30 days'$$);
