# Roadmap: html2u v2 — Security Hardening + i18n Foundation

## Overview

v2 hardens the public anonymous HTML-sharing service against the new threat model (someone uploads phishing HTML to attack a viewer) and lays the i18n foundation needed for the Taiwan-primary + international audience. The journey runs in four phases on top of the already-shipped v1: first establish the response-header surface that the rest of the milestone reports into (Phase 1), then bring up the bilingual provider as one atomic surface (Phase 2), then ship the three defense verticals that the foundation unblocks (Phase 3), and finally aggregate every signal into a single operator dashboard with documented weekly review (Phase 4). Phase order is dictated by the dependency graph identified in research, not by any imposed structure: `report-to` lives in headers Phase 1 sets, SEC-04 needs the bilingual provider Phase 2 lights up, SEC-05 reads from telemetry only Phases 1–3 can produce.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (e.g., 2.1) reserved for urgent inserts; none present at planning time

- [ ] **Phase 1: Security Headers Foundation** - Global response headers + Report-Only wrapper CSP that the rest of the milestone reports into
- [ ] **Phase 2: i18n Foundation Bundle** - Atomic next-intl provider, bilingual coverage, switcher, ja-stub drop-in proof
- [ ] **Phase 3: Defense Verticals** - Safe Browsing URL gate, CSP report ingest, bilingual legal pages on Phases 1+2 foundations
- [ ] **Phase 4: Security Status Capstone** - Operator-facing aggregator that turns every Phase 1–3 signal into a weekly-review surface

## Phase Details

### Phase 1: Security Headers Foundation
**Goal**: Every response from the app — wrapper and content — carries a correctly-scoped set of baseline security headers, ships a Report-Only wrapper CSP that emits violation reports to a documented endpoint, and never leaks wrapper headers into the raw-content route. The operator can hand a `curl -I` of any route to a scanner and have it pass without backsliding on UX-02's no-FOUC inline theme bootstrap, and pg_cron is enabled in production so downstream phases can promise the retention they implement.
**Depends on**: Nothing (first phase; touches `next.config.ts` + `supabase/schema.sql` only)
**Requirements**: SEC-02, SEC-02b, SEC-OPS-01
**Success Criteria** (what must be TRUE):
  1. `curl -I https://html2u.vercel.app/` returns HSTS `max-age=63072000` (no `preload`, no `includeSubDomains`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=() microphone=() geolocation=() interest-cohort=()`, and `X-Frame-Options: DENY` on the wrapper route.
  2. `curl -I https://html2u.vercel.app/s/<sample>/raw?t=<valid>` returns the existing strict per-response CSP unchanged — none of the wrapper headers from criterion 1 leak into the raw content route, and `X-Frame-Options: DENY` is NOT present there.
  3. The wrapper sends both modern `Reporting-Endpoints: csp-endpoint="…/api/csp-report?ctx=wrapper"` and a `Content-Security-Policy-Report-Only` header carrying `report-to csp-endpoint` plus a legacy `report-uri` fallback; the existing inline theme-bootstrap script still runs and the home page paints without FOUC.
  4. The operator can confirm in the Supabase project that the `pg_cron` extension is enabled and that `cron.schedule` jobs for `shares`, `rate_limits`, and `csp_violations` cleanup are committed in `schema.sql` (the previously-commented block is now live).
**Plans**: TBD

### Phase 2: i18n Foundation Bundle
**Goal**: A first-time visitor with `Accept-Language: zh-TW,en;q=0.8` lands on a fully zh-Hant page with no hydration warning, no FOUC, and a top-right Liquid Glass language pill they can use to switch to English without losing their `/s/<id>` URL or scroll position. The choice persists in a BCP-47-script-tagged `NEXT_LOCALE` cookie that survives every subsequent visit. Adding a Japanese stub messages file proves the architecture is drop-in. Every visible string in the app — including the not-yet-written legal pages, all error responses, and the safety banner — has a key in both `messages/en.json` and `messages/zh-Hant.json`, CI fails on key drift, and Server Actions return `errorCode` strings so the `lib/` layer stays locale-agnostic.
**Depends on**: Phase 1
**Requirements**: I18N-01, I18N-02, I18N-03, I18N-04, I18N-05
**Success Criteria** (what must be TRUE):
  1. With no cookie set, a request with `Accept-Language: zh-TW,…` renders `<html lang="zh-Hant">` and zh-Hant copy; a request with `Accept-Language: en-US` renders `<html lang="en">` and English copy — both server-side, with no console hydration warning across the 4-combo matrix `(cookie set/unset) × (browser EN/zh-Hant)`.
  2. The user clicks the top-right globe pill, picks `English`, and the page re-renders in English without navigating away from `/s/<id>`; the `NEXT_LOCALE=en` cookie is set and subsequent visits from a fresh tab stay in English even when `Accept-Language` says zh-TW.
  3. Every visible string in home, share view (password form, magic landing, safety banner), admin (login + dashboard), API error responses, and the legal-page namespace renders from `messages/{en,zh-Hant}.json` with identical key coverage in both files; CI fails the build if a key exists in only one locale.
  4. Adding `messages/ja.json` with stub strings is enough to make Japanese show up in the switcher and render across the app — no other code change required; a `ja` stub ships in the codebase as the smoke test.
  5. `generateMetadata()` returns locale-translated `<title>` and `<meta description>` on every page, while the `robots` meta tag stays a machine-only constant in code (never inside the messages files).
**Plans**: TBD
**UI hint**: yes

### Phase 3: Defense Verticals
**Goal**: Three parallelizable verticals come up on the Phase 1+2 foundations. A creator who pastes HTML containing a known-malicious URL is rejected with a localized explainer telling them which URL tripped the check; the Safe Browsing layer never silently passes during a quota outage. The Report-Only wrapper CSP from Phase 1 now flows into a hardened `/api/csp-report` ingest that survives extension noise + adversarial floods without filling the Supabase tier. Anyone asking "what are the terms?" can read `/tos`, `/privacy`, `/dmca` in either zh-Hant or English, footer-linked from every page, with TW-jurisdiction governing law and a working `abuse@` takedown contact — and the retention copy is truthful because Phase 1 enabled pg_cron. Under coarse granularity these three verticals are bundled into one phase; each is independently plannable as its own plan within the phase (SEC-01 is one plan; SEC-03 is one plan; SEC-04 may split into ToS/Privacy/DMCA sub-plans during planning).
**Depends on**: Phase 1 (Reporting-Endpoints + wrapper CSP sender; pg_cron live for retention truthfulness), Phase 2 (NextIntlClientProvider + `messages.legal.*` namespace + `errorCode` ActionState refactor)
**Requirements**: SEC-01, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  1. Submitting a share whose HTML contains `http://malware.testing.google.test/testing/malware/` is rejected within 3 seconds with a localized message naming that specific URL; submitting the same HTML while Safe Browsing is unreachable produces a `scan_status='unknown'` row (NOT `clean`) that surfaces in the admin queue, and per-URL verdicts are cached so re-uploads don't re-burn quota.
  2. The wrapper CSP intentionally violated from a test page produces exactly one row in `csp_violations` per unique `(document_uri_path, directive, blocked_host, source_host)` tuple — increments a `count` column on repeat — and a flood of 200 forged reports from one IP results in <60 stored rows because rate-limiting + 8 KB payload cap + extension-prefix filter all fire before DB write; both `application/reports+json` and `application/csp-report` content types are accepted.
  3. `/tos`, `/privacy`, `/dmca` render in the active locale (zh-Hant or en), are linked from a footer on every public page, name TW as the governing jurisdiction, include the §512(c)(3) informational fields, list `abuse@…` as the takedown contact, and the retention copy says "30 days" because Phase 1's pg_cron actually deletes at that age.
  4. Every page carries a "Last updated" date matching the git commit of its messages file, and the English version is declared the binding language in the copy itself.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Security Status Capstone
**Goal**: An operator opening `/admin/security` on Monday morning sees, in 60 seconds, whether each Phase 1–3 control is actually working — not just present. Verdict distributions reveal CRIT-1 silent fail-open before it matters; CSP-violation aggregates reveal CRIT-4 noise floods before the DB fills; a HEAD self-check confirms the Phase 1 headers parsed correctly in production; a Safe Browsing quota meter warns before the 10k/24h ceiling silently dumps every share into `unknown`; the documented weekly checklist with Google's known-malicious test URLs gives end-to-end verification that the scanner still catches what it should. By construction this phase aggregates signals only Phases 1–3 can produce, which is why it ships last.
**Depends on**: Phase 3 (needs Safe Browsing telemetry, `csp_violations` rows, and flagged-shares queue all writing real data) — transitively on Phase 1 and Phase 2
**Requirements**: SEC-05
**Success Criteria** (what must be TRUE):
  1. The `/admin/security` panel (60-s cached Server Component) shows verdict distribution (clean/flagged/unknown) for the last 7 days, p95 Safe Browsing lookup latency, 7-day lookup count, and today's quota-remaining widget — booleans alone are not shown.
  2. The headers self-check runs `HEAD /` against the live production URL, parses the actual response headers, and shows the operator the exact values present (not just ✓/✗) so a misdeployed Phase 1 config is visible immediately.
  3. The CSP-violations widget displays deduped count by directive, top-10 blocked hosts, and a 7-day rollup chart; the flagged-shares pending-review queue from SEC-01 is reachable in one click.
  4. The legal-page status block shows "Last modified" date + git SHA for each of `/tos`, `/privacy`, `/dmca` so the operator can prove during weekly review that a human reviewed in the current quarter.
  5. A documented weekly checklist on the same page lists Google's known-malicious test URLs and the manual click-through steps; the operator can record pass/fail against each item and reach the end of the review in under five minutes.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4. Phase 3's three verticals (SEC-01, SEC-03, SEC-04) are independent files and may be parallelized during plan execution; SEC-04 internally may split into ToS, Privacy, DMCA sub-plans at planning time under coarse granularity.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Headers Foundation | 0/TBD | Not started | - |
| 2. i18n Foundation Bundle | 0/TBD | Not started | - |
| 3. Defense Verticals | 0/TBD | Not started | - |
| 4. Security Status Capstone | 0/TBD | Not started | - |

## Rationale Notes

- **Phase 1 bundles SEC-02 + SEC-02b + SEC-OPS-01** because all three are config-only edits to `next.config.ts` and `supabase/schema.sql`, share the same verification surface (`curl -I` + Supabase extension check), and together form the upstream sender for Phase 3's SEC-03 ingest plus the truthfulness foundation for Phase 3's SEC-04 retention copy. Splitting them under coarse granularity would create three trivially-small phases with the same acceptance test.
- **Phase 2 is atomic by mandate** — the i18n research (CRIT-5, CRIT-6) is explicit that the cookie name, Accept-Language precedence, switcher persistence, and string provider are one inseparable surface. Shipping I18N-01 alone strands cookies; shipping I18N-02 first creates a hydration window; shipping I18N-03 without the provider crashes pages. The five I18N-* requirements ship as one phase or not at all.
- **Phase 3 under coarse granularity bundles three near-disjoint verticals.** Files barely overlap (`lib/safeBrowsing.ts`, `app/api/csp-report/route.ts`, `app/tos/page.tsx` et al.) and dependencies on Phases 1+2 are identical, so they share a phase and parallelize as plans inside it. **SEC-04 internal sub-deliverables (ToS, Privacy, DMCA pages) are large enough under coarse granularity that they may legitimately split into three plans within the phase** — the roadmap leaves Plans as TBD for the plan-phase agent to decide. SEC-01 and SEC-03 are expected to be one plan each.
- **Phase 4 ships last by construction** — SEC-05 is an aggregator over signals only Phases 1–3 produce (verdict rows, CSP rows, legal-page git SHAs). Building it earlier would require mocking every signal it consumes, which defeats its purpose as the operator-facing acceptance test for the milestone.
- **Operator decisions already baked in:** TW jurisdiction (narrows SEC-04 acceptance to TW law, no US DMCA-agent line); pg_cron in v2 (SEC-OPS-01 is explicit in Phase 1; SEC-04 retention copy can truthfully promise 30 days); wrapper CSP Report-Only (SEC-02b ships in Phase 1 alongside SEC-02; CRIT-5/MOD-4 mitigation); Safe Browsing quota-remaining widget (Phase 4 SEC-05 criterion 1).
- **Hard ordering constraints preserved end-to-end:** (1) SEC-02+SEC-02b before SEC-03 ✓ (Phase 1 → Phase 3); (2) I18N-01..05 atomic ✓ (all in Phase 2); (3) SEC-04 needs I18N-03 provider live + SEC-OPS-01 pg_cron live ✓ (Phase 3 depends on both Phase 1 and Phase 2); (4) SEC-05 last ✓ (Phase 4).
