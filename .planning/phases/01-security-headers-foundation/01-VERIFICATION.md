---
phase: 01-security-headers-foundation
verified: 2026-05-29T00:00:00Z
status: passed
score: 4/4 must-haves verified (criterion #4 live-prod proof captured 2026-05-29)
overrides_applied: 0
human_verification:
  - test: "Run `select jobname, schedule, command from cron.job order by jobname;` against the html2u production Supabase project"
    expected: "Exactly three rows: cleanup_csp_violations, cleanup_rate_limits, cleanup_shares — with the delete commands matching schema.sql; AND Database → Extensions shows pg_cron ENABLED; AND `select 1 from public.csp_violations limit 1;` returns without a relation-not-found error"
    result: "RESOLVED 2026-05-29 — operator ran the query in the production SQL editor; returned exactly three rows: cleanup_csp_violations (0 3 * * *), cleanup_rate_limits (*/30 * * * *), cleanup_shares (0 * * * *), with delete commands matching schema.sql. pg_cron self-enabled cleanly (no permission error; cron.schedule returned jobids 1-3). NOTE: the initial operator attestation was based on running a STALE saved query that lacked the Phase 1 additions (cron.job did not exist on first check) — re-running the current schema.sql Phase-1 block fixed it. This is exactly the false-positive the T-01-08 gate was designed to catch."
---

# Phase 1: Security Headers Foundation Verification Report

**Phase Goal:** Every response — wrapper and content — carries a correctly-scoped set of baseline security headers, ships a Report-Only wrapper CSP that emits violation reports to a documented endpoint, and never leaks wrapper headers into the raw-content route. The operator can hand a `curl -I` of any route to a scanner and have it pass without backsliding on UX-02's no-FOUC inline theme bootstrap, and pg_cron is enabled in production so downstream phases can promise the retention they implement.
**Verified:** 2026-05-29
**Status:** passed (criterion #4 live-prod proof captured 2026-05-29)
**Re-verification:** Yes — criterion #4 closed after operator captured the three-row `cron.job` proof in production

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Wrapper route `/` returns the five SEC-02 baseline headers with exact values (HSTS `max-age=63072000` no preload/includeSubDomains, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=() microphone=() geolocation=() interest-cohort=()`, `X-Frame-Options: DENY`) | ✓ VERIFIED | `next.config.ts:30-49` sets all five keys verbatim inside the wrapper rule. `grep -c "preload\|includeSubDomains"` → `0`. HEADERS_OK gate passes. tsc clean. |
| 2 | Raw route `/s/<id>/raw?t=<valid>` keeps its own strict per-response CSP and NONE of the wrapper headers leak in; `X-Frame-Options: DENY` is NOT present | ✓ VERIFIED | Negative-lookahead source `"/((?!s/.*/raw\|api/).*)"` (`next.config.ts:25`) provably excludes `/s/<id>/raw` — confirmed by regex simulation (`/s/abc123/raw` → no-match). `app/s/[id]/raw/route.ts:31-39` sets only its own CSP + X-Robots-Tag + Cache-Control; grep finds no wrapper header keys in that file. |
| 3 | Wrapper sends `Reporting-Endpoints: csp-endpoint="…/api/csp-report?ctx=wrapper"` + `Content-Security-Policy-Report-Only` with `report-to csp-endpoint` and legacy `report-uri`; inline theme bootstrap runs with no FOUC | ✓ VERIFIED | `next.config.ts:53-77`: Reporting-Endpoints + Report-Only CSP carrying both `report-to csp-endpoint` and `report-uri …?ctx=wrapper`. CSP_OK gate passes; bare enforcing `"Content-Security-Policy"` count = 0. Inline `THEME_BOOTSTRAP` script present in `app/layout.tsx:18,26` runs synchronously; Report-Only never blocks it (no-FOUC preserved). |
| 4 | `pg_cron` enabled in production AND `cron.schedule` jobs for shares, rate_limits, csp_violations committed in schema.sql (previously-commented block now live) | ⚠️ CODE-VERIFIED / PROD UNCONFIRMED | Code side fully on disk: `supabase/schema.sql:142-145` has live (uncommented) `create extension if not exists pg_cron` + three `cron.schedule` jobs with exact SEC-OPS-01 delete statements; forward-compatible `public.csp_violations` table + index + RLS at `:39-61`. SCHEMA_OK gate passes; no `drop`/`grant`; idempotent. **Live-prod application is operator-attested only ("I've applied it") — the required `cron.job` three-row proof was NOT captured (01-02-SUMMARY.md honesty note).** Routed to human verification. |

**Score:** 3/4 truths fully VERIFIED in codebase; truth #4 is code-verified on disk but its live-prod clause depends on unrecorded operator attestation → human confirmation required.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `next.config.ts` | Async `headers()` returning a wrapper-scoped block whose source excludes `/s/:id/raw` | ✓ VERIFIED | Single `async headers()` rule, negative-lookahead source, both SEC-02 + SEC-02b header sets, `reactCompiler: true` preserved, tsc clean |
| `supabase/schema.sql` | Live pg_cron extension + three cleanup cron jobs + minimal csp_violations table DDL | ✓ VERIFIED (on disk) | Uncommented block with 3 jobs + table + index + RLS; idempotent; no destructive statements |
| `app/s/[id]/raw/route.ts` (unchanged) | Keeps own strict CSP, receives no wrapper headers | ✓ VERIFIED | Untouched by phase; sets only its own CSP/X-Robots-Tag/Cache-Control |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `next.config.ts headers() source` | all wrapper routes except `/s/.*/raw` | negative-lookahead regex `(?!` | ✓ WIRED | Pattern `"/((?!s/.*/raw\|api/).*)"` present and behaviorally correct (regex simulation: wrapper routes MATCH, `/s/<id>/raw` + `/api/*` excluded) |
| `cron.schedule('cleanup_csp_violations', ...)` | `public.csp_violations` table | `delete ... where created_at < now() - interval '30 days'` | ✓ WIRED | Job references a table that is created earlier in the same schema.sql; cron job will not error per-run |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEC-02 | 01-01 | Baseline security headers via next.config.ts (HSTS `max-age=63072000` only, nosniff, referrer-policy, permissions-policy, X-Frame-Options DENY; excludes `/s/.*/raw`) | ✓ SATISFIED | next.config.ts:30-49 + exclusion source:25 |
| SEC-02b | 01-01 | Report-Only wrapper CSP with modern Reporting-Endpoints + report-to + legacy report-uri; does NOT enforce | ✓ SATISFIED | next.config.ts:53-77 (Report-Only variant; both directives) |
| SEC-OPS-01 | 01-02 | pg_cron enabled in prod + three committed cron.schedule jobs; uncomments previously-commented block | ⚠️ CODE SATISFIED / PROD NEEDS HUMAN | schema.sql:142-145 committed & live; production enablement operator-attested only |

All three declared requirement IDs accounted for. No ORPHANED requirements: REQUIREMENTS.md maps exactly SEC-02, SEC-02b, SEC-OPS-01 to Phase 1, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in modified files; no destructive SQL; no middleware/proxy file created |

The `public.csp_violations` table is intentionally minimal and not yet written by any code path — this is by design (SEC-03 wires ingest); it exists so the cron job references a real table. Not classified as a stub: it is a forward-compatible DDL artifact, not a hollow render path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles with the new headers() | `npx tsc --noEmit -p tsconfig.json` | no errors | ✓ PASS |
| Negative-lookahead excludes raw + api, matches wrapper | regex simulation in node | `/s/<id>/raw` & `/api/*` excluded; `/`,`/admin`,`/s/<id>`,`/m/...` match | ✓ PASS |
| Grep gates (Task 1, Task 2, Schema) | plan verify blocks re-run | HEADERS_OK, CSP_OK, SCHEMA_OK | ✓ PASS |
| Live `curl -I` of running server (header presence at runtime) | requires `next start` + running server | not re-run by verifier (SUMMARY captured it at 01-01) | ? SKIP — covered by human verification list / SUMMARY evidence |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist and no probes are declared in the PLANs. Probe execution: SKIPPED (no probes defined).

### Human Verification Required

#### 1. Production pg_cron + cron jobs confirmation (SEC-OPS-01 / Criterion #4)

**Test:** Against the html2u production Supabase project, run:
```
select jobname, schedule, command from cron.job order by jobname;
```
Also check Database → Extensions for `pg_cron`, and run `select 1 from public.csp_violations limit 1;`.

**Expected:** Exactly three rows — `cleanup_csp_violations`, `cleanup_rate_limits`, `cleanup_shares` — with delete commands matching `supabase/schema.sql:143-145`; `pg_cron` shown ENABLED; the `csp_violations` query returns without a relation-not-found error.

**Why human:** Enabling pg_cron and registering cron jobs is a privileged production database action that Claude cannot perform or read. Build/type/grep checks all pass without it — this is the documented false-positive risk (T-01-08). The operator stated "I've applied it" but the raw three-row `cron.job` proof was never captured inline (see 01-02-SUMMARY.md "Evidence honesty note"). The phase goal explicitly requires pg_cron "enabled in production," so live state — not code state — is the contract for this criterion.

### Gaps Summary

No code-side gaps. All four must-haves are satisfied in the codebase: the five SEC-02 headers ship with exact values, the SEC-02b Report-Only CSP + Reporting-Endpoints + legacy report-uri are present, the negative-lookahead source provably keeps every wrapper header (including `X-Frame-Options: DENY`) off `/s/<id>/raw`, the inline no-FOUC theme bootstrap is untouched, and schema.sql commits the live pg_cron block with three valid cron jobs against a forward-compatible `csp_violations` table.

The single open item is not a code defect but an evidence-fidelity gap on the one deliberately-human-gated, privilege-bound step: production pg_cron application is attested by the operator but the `cron.job` three-row proof the blocking checkpoint required was not captured. Per the verification decision tree, any open human-verification item makes the phase `human_needed` rather than `passed`. Once the operator pastes the three-row `cron.job` result, criterion #4 closes and the phase is fully passed.

---

_Verified: 2026-05-29_
_Verifier: Claude (gsd-verifier)_
