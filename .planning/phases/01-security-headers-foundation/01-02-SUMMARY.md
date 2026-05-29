---
phase: 01-security-headers-foundation
plan: 02
subsystem: db-ops
tags: [pg_cron, supabase, retention, csp_violations, schema]
requires:
  - "Phase 1 wrapper CSP sender (SEC-02b) — emits the violations csp_violations will eventually store"
provides:
  - "SEC-OPS-01: live pg_cron extension + three cron.schedule cleanup jobs in schema.sql (shares, rate_limits, csp_violations)"
  - "Forward-compatible public.csp_violations table so the 30-day cleanup job references a real table from day one"
  - "Truthful 30-day retention foundation that SEC-04 (Phase 3) legal pages can promise"
affects:
  - supabase/schema.sql
tech-stack:
  added:
    - "pg_cron (Supabase Postgres extension, self-enabled via create extension if not exists)"
  patterns:
    - "cron.schedule upsert-by-jobname for idempotent re-runnable scheduling"
    - "create table if not exists + create extension if not exists keep schema.sql safe to re-run in prod"
key-files:
  created: []
  modified:
    - supabase/schema.sql
decisions:
  - "Tension 2: create a minimal forward-compatible csp_violations table NOW (not in SEC-03) because cron.schedule stores SQL as text and does not validate the referenced table at schedule time — the cleanup_csp_violations job would error on every 3am run until the table exists"
  - "csp_violations columns chosen to match the SEC-03 dedup key (document_uri_path, directive, blocked_host, source_host) + count + created_at, so SEC-03 ALTERs/extends rather than replaces (backward-compatible per CLAUDE.md migration constraint)"
  - "RLS enabled with no policies on csp_violations (same pattern as shares/rate_limits — service_role bypasses; anon/authenticated denied)"
  - "Task 2 (prod application) verified by operator confirmation; raw cron.job query output not captured inline (honest evidence gap recorded below)"
metrics:
  duration: ~3m
  completed: 2026-05-29
---

# Phase 1 Plan 2: SEC-OPS-01 pg_cron + Cleanup Jobs Summary

The previously-commented pg_cron block in `supabase/schema.sql` is now live: it self-enables the `pg_cron` extension and registers three idempotent `cron.schedule` cleanup jobs (`cleanup_shares`, `cleanup_rate_limits`, `cleanup_csp_violations`), and a minimal forward-compatible `public.csp_violations` table is created now so the 30-day retention job references a real table from day one — making the retention promise SEC-04 will print in the legal pages actually true.

## What Was Built

In `supabase/schema.sql`:

**Forward-compatible `public.csp_violations` table** (additive, backward-compatible per CLAUDE.md migration constraint):
- `id bigint generated always as identity primary key`
- `document_uri_path text`, `directive text`, `blocked_host text`, `source_host text` — the SEC-03 dedup key
- `count integer not null default 1` — for the future per-tuple increment-on-repeat behavior (SEC-03)
- `created_at timestamptz not null default now()`
- `csp_violations_created_at_idx` index on `created_at` for the cleanup job's WHERE clause
- RLS enabled with no policies (anon/authenticated denied; service_role bypasses)

**Live pg_cron block** (formerly fully commented; now uncommented and extended with the third job):
```sql
create extension if not exists pg_cron;
select cron.schedule('cleanup_shares',          '0 * * * *',    $$delete from public.shares         where expires_at < now()$$);
select cron.schedule('cleanup_rate_limits',     '*/30 * * * *', $$delete from public.rate_limits    where expires_at < now()$$);
select cron.schedule('cleanup_csp_violations',  '0 3 * * *',    $$delete from public.csp_violations where created_at < now() - interval '30 days'$$);
```

The surrounding guidance comment was updated to note the SQL now self-enables the extension (with the Dashboard → Extensions fallback if the SQL editor lacks the privilege) and that `cron.schedule` is upsert-like by job name, so re-running the file updates jobs in place rather than duplicating them.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add forward-compatible csp_violations table + live pg_cron block | 08bce7c | supabase/schema.sql |
| 2 | Operator applies schema.sql to production Supabase + confirms pg_cron (human-action checkpoint) | (ops, no commit) | — |

## Verification Evidence (goal-backward proof)

### Task 1 — schema content (automated grep gate)
After stripping comment lines, the grep gate confirms all required live statements survive:
- `create extension if not exists pg_cron` — present
- `create table if not exists public.csp_violations` — present
- `cleanup_csp_violations`, `cleanup_shares`, `cleanup_rate_limits` — all three present
- `interval '30 days'` — present (csp_violations 30-day TTL)
- Gate result: `SCHEMA_OK`

No destructive statements were added (no `drop table` / `grant`); idempotency preserved (`if not exists` on extension + table, `cron.schedule` upsert-by-name).

### Task 2 — production application (human-action checkpoint, operator-confirmed)
This was a BLOCKING human-action gate because the project has no migration tooling and enabling `pg_cron` + registering cron jobs is a privileged production database action Claude cannot perform autonomously, and build/type checks pass WITHOUT it (a false-positive risk for SEC-OPS-01).

**Resolution:** The operator confirmed they applied the full updated `supabase/schema.sql` to the production Supabase project and that `pg_cron` is enabled with all three cron jobs (`cleanup_shares`, `cleanup_rate_limits`, `cleanup_csp_violations`) registered. Operator response: *"I've applied it."*

**Evidence honesty note:** This is an OPERATOR-CONFIRMED resolution. The plan's acceptance criterion asked the operator to paste the `select jobname, schedule from cron.job` result inline as goal-backward proof; that raw query output was NOT captured in the transcript. The confirmation is verbal/asserted, not captured-evidence. SEC-OPS-01 is being marked complete on the strength of the operator's confirmation. If a stricter audit trail is needed later, re-run `select jobname, schedule, command from cron.job order by jobname;` against the production project and attach the three-row result.

## Deviations from Plan

None — plan executed exactly as written. The only note is the evidence-capture gap on Task 2 documented above (operator-confirmed, raw `cron.job` output not pasted inline); this is an evidence-fidelity caveat, not a deviation in implementation.

## Cross-Phase Notes

- **SEC-03 (Phase 3)** owns the full `csp_violations` ingest schema and will ALTER/extend this table (additive, backward-compatible) — it will NOT replace it. The columns created here are the dedup key SEC-03 needs, so the `/api/csp-report` ingest can populate them directly.
- **SEC-04 (Phase 3)** legal pages (`/privacy`, `/tos`) can now truthfully promise "30-day retention" because the `cleanup_csp_violations` job actually deletes rows older than 30 days every night at 03:00.

## Known Stubs

None that block the plan goal. The `csp_violations` table is intentionally minimal and not yet written to by any code path — that is by design (SEC-03 wires the ingest). It exists now solely so the `cleanup_csp_violations` cron job references a real table and does not error per-run (threat T-01-06 mitigation). This is documented and intentional, not an accidental stub.

## Threat Coverage

- **T-01-05 (EoP):** cron job SQL is fixed literal text — only DELETEs aged rows from three known tables; no DDL, grants, or dynamic SQL. Verified: no `drop`/`grant` added.
- **T-01-06 (DoS — missing table):** mitigated by creating csp_violations now so the job never errors.
- **T-01-07 (Tampering — re-run):** idempotent (`if not exists`, upsert-by-jobname).
- **T-01-08 (false-positive verification):** Task 2 BLOCKING human-action gate enforced; SEC-OPS-01 not marked done on build/type checks alone. (Resolution is operator-confirmed; see evidence-honesty note above.)

## Self-Check: PASSED
- supabase/schema.sql exists and modified: FOUND
- Commit 08bce7c: FOUND in git log (grep "01-02")
- Comment-stripped grep gate over schema.sql: SCHEMA_OK (extension + table + three jobs + 30-day interval)
- Task 2: operator-confirmed production application (raw cron.job proof not captured inline — recorded honestly)
