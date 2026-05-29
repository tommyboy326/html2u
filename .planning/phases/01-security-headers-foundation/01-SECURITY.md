---
phase: 01
slug: security-headers-foundation
status: secured
threats_open: 0
threats_closed: 8
asvs_level: 1
block_on: high
created: 2026-05-29
---

# SECURITY.md — Phase 01: security-headers-foundation

**Audited:** 2026-05-29
**ASVS Level:** 1
**block_on:** high
**Threats Closed:** 8/8
**Result:** SECURED (one open HUMAN-UAT item — operational attestation, not a code gap)

This audit VERIFIES each declared threat mitigation against the implemented code
(`next.config.ts`, `supabase/schema.sql`, `app/s/[id]/raw/route.ts`,
`app/layout.tsx`). Documentation/intent alone was not accepted — every
`mitigate` threat was confirmed by a grep/read match in the cited file at the
cited location. `accept` threats were confirmed against the documented rationale
holding true in code.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-01-01 | Tampering | mitigate | CLOSED | `next.config.ts:30-49` — all five SEC-02 header values are static string literals. Independent grep for `:param`, `${}`, `req.`, `request.`, `headers[` interpolation in `next.config.ts` → `NO_DYNAMIC_INTERPOLATION`. No request-derived data reaches any header value; response-splitting/header injection via config is structurally impossible. HSTS hygiene: `grep -c "preload\|includeSubDomains"` → `0` (value is exactly `max-age=63072000`). |
| T-01-02 | Information Disclosure | mitigate | CLOSED | **(HIGHEST severity — iframe trust contract.)** `next.config.ts:25` source = `"/((?!s/.*/raw\|api/).*)"` — negative-lookahead excludes `/s/<id>/raw` (and `/api/`). The single wrapper rule is the ONLY header block, so every SEC-02 + SEC-02b header (including `X-Frame-Options: DENY`) is scoped off the raw route. Raw boundary CONFIRMED UNCHANGED: `app/s/[id]/raw/route.ts:31-39` sets only its own `Content-Security-Policy` (`buildCsp`), `X-Robots-Tag`, `Cache-Control` — no wrapper header keys, no `X-Frame-Options`. Git: route.ts last modified in initial commit only; neither phase commit (3604067, 08bce7c) touched it. 01-01-SUMMARY curl dump corroborates clean raw route. |
| T-01-03 | Spoofing/Elevation | accept (documented) | CLOSED | `next.config.ts:63` header key is `Content-Security-Policy-Report-Only` (grep count = 1); independent grep for a bare enforcing `"Content-Security-Policy"` key in `next.config.ts` → `NO_BARE_ENFORCING_CSP`. The wrapper CSP genuinely does NOT enforce — rationale holds. The raw route's OWN enforcing `Content-Security-Policy` (`app/s/[id]/raw/route.ts:37`, `buildCsp` at `:46-62`) is in a separate file, unaffected by the Report-Only wrapper policy. Accepted-risk rationale documented below. |
| T-01-04 | Information Disclosure | accept | CLOSED | `next.config.ts:56` and `:75` both point at `https://html2u.vercel.app/api/csp-report?ctx=wrapper` — first-party origin (the production app domain). Endpoint (SEC-03) not yet built; reports 404 until then. No data leaks to a third party because the URL is first-party and nothing receives reports yet. Accepted-risk rationale documented below. |
| T-01-05 | Elevation of Privilege | mitigate | CLOSED | `supabase/schema.sql:143-145` — the three `cron.schedule` job bodies are fixed literal `$$...$$` text: DELETE-only on `public.shares`, `public.rate_limits`, `public.csp_violations`. Independent grep over comment-stripped schema for `drop table\|grant \|execute \|format(\|\|\|` (dynamic SQL / privilege ops) → `NO_DESTRUCTIVE_OR_DYNAMIC`. No DDL, no grants, no cross-schema access, no user input in job bodies. |
| T-01-06 | Denial of Service | mitigate | CLOSED | `supabase/schema.sql:39` `create table if not exists public.csp_violations`, index `csp_violations_created_at_idx` at `:50`, RLS `alter table public.csp_violations enable row level security` at `:61`. Table is created earlier in the same file than the `cleanup_csp_violations` job at `:145`, so the 3am job references a real table and will not error per-run. |
| T-01-07 | Tampering | accept | CLOSED | `supabase/schema.sql` uses `create extension if not exists` (`:142`), `create table if not exists` (7 occurrences), and `cron.schedule` upsert-by-jobname. Independent grep for `drop ` → `NO_DROP`. Re-running cannot duplicate jobs or destroy data. Idempotency rationale holds. Accepted-risk rationale documented below. |
| T-01-08 | Repudiation/Spoofing | mitigate | CLOSED (code gate present) — PROD attestation tracked as OPEN HUMAN-UAT | The blocking gate is real in the plan structure: `01-02-PLAN.md:101` `<task type="checkpoint:human-action" gate="blocking">` with a `<resume-signal>` requiring the operator to paste the `cron.job` proof. SEC-OPS-01 is explicitly NOT satisfiable by build/type/grep checks alone (`01-02-PLAN.md:13`, `:107`). The gate against false-positive verification exists as designed. Per task scope, the live-prod proof itself is a HUMAN-UAT item (operator attested "I've applied it" but the three-row `cron.job` output was not captured — `01-02-SUMMARY.md:84`, `01-VERIFICATION.md` status `human_needed`). This is an evidence-fidelity / ops gap, NOT a code mitigation gap. |

**Code-side mitigations: 8/8 present and independently verified. Zero implementation gaps.**

---

## Accepted Risks Log

| Threat ID | Risk Accepted | Rationale (verified to hold in code) | Sunset / Owner |
|-----------|---------------|--------------------------------------|----------------|
| T-01-03 | Wrapper CSP does not enforce (Report-Only) — cannot stop an XSS/inline-script attack on the wrapper origin. | Confirmed `Content-Security-Policy-Report-Only` (`next.config.ts:63`), no enforcing variant on wrapper. Report-Only is a deliberate choice so the UX-02 inline theme bootstrap (`app/layout.tsx:18,26`) keeps running with no FOUC. The untrusted-HTML boundary (`/s/<id>/raw`) is protected by its OWN enforcing strict CSP, which is unaffected. No downstream phase may assume the wrapper is CSP-protected. | Enforce mode + nonce refactor deferred to SEC-V3-05 (v3). |
| T-01-04 | `Reporting-Endpoints` / `report-uri` point at `/api/csp-report`, which is not built this phase — reports 404 until SEC-03. | URL is first-party (`https://html2u.vercel.app`, the app's own origin). Nothing receives reports yet, so no data leaks to any third party. Confirmed `next.config.ts:56,75`. | Endpoint built in SEC-03 (Phase 3). |
| T-01-07 | `supabase/schema.sql` is re-run by operators in production. | Idempotent: `create extension/table if not exists`, `cron.schedule` upsert-by-jobname. No `drop`/destructive statements (grep `NO_DROP`). Re-running cannot duplicate jobs or destroy data. | Permanent property of the schema file. |

---

## Open / Human-UAT Items (not code blockers)

| Item | Threat | Type | Status |
|------|--------|------|--------|
| Production `pg_cron` enablement + three `cron.job` rows + `csp_violations` table present in live Supabase | T-01-08 / SEC-OPS-01 | HUMAN-UAT (privileged prod DB action; not Claude-observable) | OPEN — operator attested ("I've applied it") but the required `select jobname, schedule, command from cron.job` three-row proof was never captured inline. Tracked in `01-VERIFICATION.md` (status `human_needed`). This is the deliberately human-gated, privilege-bound step — an evidence-fidelity gap, NOT a code mitigation gap. The code gate (blocking checkpoint) that PREVENTS false-positive verification is present and correct. |

**block_on assessment:** `block_on: high`. The single open item is an operational
attestation gap on a deliberately human-gated step, not an absent code
mitigation. No HIGH-severity threat has a missing code-side mitigation. The
highest-severity threat for this phase (T-01-02, the iframe trust contract) is
CLOSED with independent evidence. Phase is not blocked on code grounds.

---

## Unregistered Flags

None. The threat register at plan time
(`register_authored_at_plan_time: true`) covers the entire new attack surface
introduced this phase:
- New response headers on wrapper routes → T-01-01, T-01-02, T-01-03, T-01-04.
- New `pg_cron` jobs + `csp_violations` table → T-01-05, T-01-06, T-01-07, T-01-08.

Neither SUMMARY declares a `## Threat Flags` section with new attack surface
beyond the register. No new exports, auth paths, or data flows appeared during
implementation that lack a threat mapping. The `csp_violations` table is
write-by-no-code-path this phase (ingest deferred to SEC-03) — no new ingestion
attack surface yet.

---

## Files Audited (READ-ONLY — never modified)

- `next.config.ts` — T-01-01..04
- `app/s/[id]/raw/route.ts` — T-01-02 (boundary, confirmed UNCHANGED)
- `app/layout.tsx` — T-01-03 (inline theme bootstrap context)
- `supabase/schema.sql` — T-01-05..08
