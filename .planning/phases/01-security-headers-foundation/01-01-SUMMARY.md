---
phase: 01-security-headers-foundation
plan: 01
subsystem: security-headers
tags: [security, headers, csp, hsts, next-config]
requires: []
provides:
  - "SEC-02 baseline security headers on all wrapper routes"
  - "SEC-02b Report-Only wrapper CSP + Reporting-Endpoints pointing at /api/csp-report?ctx=wrapper"
  - "Header surface that SEC-03 (/api/csp-report) and SEC-05 (prod self-check) build on"
affects:
  - next.config.ts
tech-stack:
  added: []
  patterns:
    - "next.config.ts async headers() with negative-lookahead source to scope headers off the raw-content route"
key-files:
  created: []
  modified:
    - next.config.ts
decisions:
  - "Single wrapper-scoped header rule (one source) carries both SEC-02 and SEC-02b so both are excluded from /s/<id>/raw in one place"
  - "Source regex /((?!s/.*/raw|api/).*) excludes both the raw route and /api/* — API routes do not need X-Frame-Options"
  - "CSP shipped as Content-Security-Policy-Report-Only (not enforcing) so the UX-02 inline theme bootstrap keeps running with no FOUC; enforce mode deferred to SEC-V3-05"
metrics:
  duration: ~2m
  completed: 2026-05-29
---

# Phase 1 Plan 1: Security Headers Foundation Summary

SEC-02 baseline security headers and the SEC-02b Report-Only wrapper CSP ship globally via a single negative-lookahead-scoped `headers()` rule in `next.config.ts`, provably excluded from the sandboxed `/s/<id>/raw` route so the iframe content-isolation trust contract stays intact.

## What Was Built

A single `async headers()` method on the exported `nextConfig` (alongside the preserved `reactCompiler: true`). One header rule whose `source` is the path-to-regexp negative-lookahead `"/((?!s/.*/raw|api/).*)"` — it matches every wrapper route but NOT the raw-content route `/s/<id>/raw` (nor `/api/*`). That single rule sets:

**SEC-02 baseline (exact values):**
- `Strict-Transport-Security: max-age=63072000` (no `preload`, no `includeSubDomains` — CRIT-3, Vercel already manages HSTS for *.vercel.app)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=() microphone=() geolocation=() interest-cohort=()`
- `X-Frame-Options: DENY`

**SEC-02b Report-Only CSP + reporting:**
- `Reporting-Endpoints: csp-endpoint="https://html2u.vercel.app/api/csp-report?ctx=wrapper"`
- `Content-Security-Policy-Report-Only: …; report-to csp-endpoint; report-uri https://html2u.vercel.app/api/csp-report?ctx=wrapper` (Report-Only — never enforces, so the inline theme bootstrap keeps running)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add wrapper-scoped baseline security headers (SEC-02) | 3604067 | next.config.ts |
| 2 | Add Report-Only wrapper CSP + Reporting-Endpoints (SEC-02b) | 3604067 | next.config.ts |

Both tasks modify the same single header rule in `next.config.ts` (Task 2 extends Task 1's `headers` array), so they landed in one atomic commit.

## Verification Evidence (goal-backward proof)

Built with `npx next build` (compiled successfully, TypeScript clean), started `next start -p 3210`, created a real share via `POST /api/shares`, extracted the minted raw token from `/s/<id>`, then curled both routes.

### Success Criterion #1 + #3 — WRAPPER route carries all headers

`curl -I http://localhost:3210/`:
```
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=63072000
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=() microphone=() geolocation=() interest-cohort=()
X-Frame-Options: DENY
Reporting-Endpoints: csp-endpoint="https://html2u.vercel.app/api/csp-report?ctx=wrapper"
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; base-uri 'self'; form-action 'self'; report-to csp-endpoint; report-uri https://html2u.vercel.app/api/csp-report?ctx=wrapper
Content-Type: text/html; charset=utf-8
```

### Success Criterion #2 — RAW route is provably CLEAN

`curl -I "http://localhost:3210/s/YIwl9tyU53JJHTeYayUp9/raw?t=<minted-token>"`:
```
HTTP/1.1 200 OK
vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
cache-control: no-store
content-security-policy: default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'
content-type: text/html; charset=utf-8
x-robots-tag: noindex, nofollow
```

The raw route shows ONLY its own strict per-response CSP and `X-Robots-Tag` / `Cache-Control`. It carries NONE of the wrapper headers — no `X-Frame-Options`, no `Strict-Transport-Security`, no `Permissions-Policy`, no `Reporting-Endpoints`, no `Content-Security-Policy-Report-Only`. The negative-lookahead source correctly excludes `/s/<id>/raw` (threat T-01-02 mitigated — highest-severity check for this phase).

### Success Criterion #3 — no FOUC

The served home page HTML still contains the inline `html2u-theme` bootstrap script, and the CSP is `Content-Security-Policy-Report-Only` (never enforces). The inline script therefore runs synchronously before first paint, so a dark-mode client sees no light-to-dark flash. Report-Only mode will only EMIT a `script-src` violation report for the inline script — accepted in v2 per SEC-02b; enforce mode + nonce refactor is deferred to SEC-V3-05.

### Grep gates
- Task 1 gate: `HEADERS_OK` (async headers, max-age=63072000, interest-cohort=(), X-Frame-Options, `(?!` lookahead all present)
- HSTS hygiene: `grep -c "preload\|includeSubDomains"` → `0`
- Task 2 gate: `CSP_OK` (Content-Security-Policy-Report-Only, Reporting-Endpoints, report-to csp-endpoint, report-uri, ctx=wrapper all present)
- No bare enforcing `"Content-Security-Policy"` on wrapper routes (count 0)
- No middleware/proxy file created (headers ship via next.config.ts only)
- `npx tsc --noEmit` / `next build` TypeScript: clean, no new errors

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 both edit a single shared header rule, so they are recorded under one commit (3604067) rather than two; the per-task content is fully present and verified.

## Known Stubs

None introduced by this plan. NOTE (expected, not a stub in this codebase): the Reporting-Endpoints / report-uri URL points at `https://html2u.vercel.app/api/csp-report?ctx=wrapper`, which does NOT exist yet — it is built in SEC-03 (a later phase). Until SEC-03 ships, browser CSP reports POSTed there will 404. This is intentional and documented (threat T-01-04, accepted): no data leaks because nothing receives the reports yet and the URL is first-party.

## Self-Check: PASSED
- next.config.ts exists and modified: FOUND
- Commit 3604067: FOUND in git log
- All five SEC-02 headers + SEC-02b headers confirmed live via curl on wrapper route
- Raw route confirmed clean via curl
