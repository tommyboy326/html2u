# html2u

## What This Is

A public, anonymous service that turns AI-generated HTML into shareable links.
Anyone — engineer or not — can paste/upload an HTML snippet and immediately
get a URL that renders the page in a sandboxed iframe, optionally protected by
a password or a one-time "magic" link, and auto-expires. Live at
https://html2u.vercel.app.

Audience: Taiwan-local users (zh-Hant primary), international English users
(en), and longer-term Hong Kong / Mainland (zh-Hans) and Japan / Korea
(ja, ko).

## Core Value

**The link the user sends to their counterpart shows the HTML they intended —
nothing else gets to steal data, hijack the tab, or weaponize the page against
the viewer.** Everything else (admin UX, theme polish, i18n) can fail; this
trust contract cannot.

## Requirements

### Validated

Shipped and confirmed (mapped from `.planning/codebase/` and verified end-to-end
on production):

- ✓ **CORE-01** — Anonymous HTML upload via web form (paste, drag-and-drop, or file picker) — shipped
- ✓ **CORE-02** — Three access modes per share: `link` (public, URL is the gate), `password` (bcrypt, reusable), `magic` (one-time, atomic consume on landing click) — shipped
- ✓ **CORE-03** — User-selectable TTL: 1h / 1d / 7d / 30d, with automatic deletion (lazy on read, pg_cron-eligible) — shipped
- ✓ **CORE-04** — Programmatic share creation via `POST /api/shares` (rate-limited per IP) — shipped
- ✓ **SAFE-01** — Sandboxed iframe rendering (no `allow-same-origin`, no top-navigation, no popups, no downloads) — shipped
- ✓ **SAFE-02** — Default strict CSP on raw content: `default-src 'none'`, `connect-src 'none'`, `form-action 'none'`, only inline + `data:` resources (JS runs, exfil channels closed); opt-in `allowExternal` mode for CDN-needing content — shipped
- ✓ **SAFE-03** — Un-removable safety banner (Liquid Glass frosted bar) above the iframe, with anti-phishing copy and report button — shipped
- ✓ **SAFE-04** — Token-gated `/s/[id]/raw` (short-lived HMAC token minted by the wrapper, cross-domain-safe) — shipped
- ✓ **SAFE-05** — Site-wide `noindex` + `robots.txt` disallow — shipped
- ✓ **SAFE-06** — Per-IP rate limiting on create (30/h), unlock (6/5min), report (10/h), magic consume — shipped
- ✓ **SAFE-07** — Uploader IP logging for abuse tracing — shipped
- ✓ **SAFE-08** — Anonymous report endpoint (`POST /api/report`) incrementing a per-share counter visible in admin — shipped
- ✓ **ADMIN-01** — `/admin` dashboard: list all shares with mode, views, reports, IP, expiry, search, delete — shipped
- ✓ **ADMIN-02** — Google (Gmail) login for admin via Auth.js, restricted to `ADMIN_EMAILS` allowlist (production); `ADMIN_PASSWORD` fallback when Google not configured (dev only) — shipped
- ✓ **UX-01** — Apple.com-style design (DESIGN.md): SF Pro, Action Blue `#0066cc` only, hairline borders, no decorative shadows — shipped
- ✓ **UX-02** — Three-state theme toggle (system / light / dark) with inline pre-paint bootstrap (no FOUC) — shipped
- ✓ **UX-03** — Liquid Glass treatment on floating chrome only (safety banner, theme toggle), `prefers-reduced-transparency` fallback — shipped

### Active

This milestone (v2 — Security Hardening + i18n Foundation):

#### Security

- [ ] **SEC-01** — Safe Browsing URL scan: on share creation, extract every URL from the HTML and check against Google Safe Browsing v4 Lookup API; reject if any match phishing/malware, flag if suspicious (admin can review)
- [ ] **SEC-02** — Basic security HTTP headers across the app: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation off), `X-Frame-Options` where iframing is not expected
- [ ] **SEC-03** — CSP violation reporting: add `report-to` / `report-uri` to the content CSP, ingest reports at `/api/csp-report`, surface aggregated violations in admin
- [ ] **SEC-04** — Legal pages: `/tos`, `/privacy`, `/dmca` (or `/abuse`) — minimum public-facing legal copy explaining anonymous upload terms, IP logging, takedown procedure, data retention; bilingual zh-Hant + en
- [ ] **SEC-05** — Admin "Security Status" panel + weekly-review workflow: at-a-glance status for each SEC-0X item (Safe Browsing API healthy, headers present, CSP reports last 7d count), plus a documented manual checklist with known-malicious sample shares to test

#### Internationalization

- [ ] **I18N-01** — Automatic locale detection from `Accept-Language` header (server-side), fallback to `zh-Hant`
- [ ] **I18N-02** — Language switcher in the top-right (next to theme toggle), matching Liquid Glass pill style; persists selection in cookie
- [ ] **I18N-03** — Full translation coverage for all UI strings (home, share view, password form, magic landing, admin, errors, safety banner) in **zh-Hant** and **en**
- [ ] **I18N-04** — Locale-aware metadata (page `<title>`, `<meta description>`) and `<html lang>`
- [ ] **I18N-05** — Translation infrastructure ready to add zh-Hans / ja / ko without code changes (drop in `messages/{locale}.json`)

### Out of Scope

Explicit exclusions, with reasoning to prevent re-adding:

- **Vercel BotID** — deferred to v3. Requires Vercel Pro plan (~$20/mo); Safe Browsing (SEC-01) covers the most-likely abuse vector (hosting phishing) at zero cost. Revisit if abuse volume rises.
- **CONTENT_ORIGIN separate content domain** — deferred to v3. The architecture (`CONTENT_ORIGIN` env var) is already plumbed; needs only a second purchased domain pointed at the same Vercel project. Skip until abuse signal suggests main-domain reputation is at risk.
- **Report categorization + admin email notifications** — deferred to v3. Counter + dashboard is enough for current volume; revisit when the operator can't keep up via dashboard.
- **Max TTL cap below 30d / scheduled re-review** — deferred to v3. 30d is acceptable; can tighten if long-lived phishing pages become a problem.
- **zh-Hans / ja / ko translations** — v2.5 candidates. Architecture ships in v2 so locales can be added drop-in without rebuild. Validate user demand before paying translation cost.
- **URL-prefix locale routing (`/en/`, `/ja/`)** — out. App is `noindex`, so SEO is not a factor; cookie-based switching preserves share URLs (`/s/<id>` stays the same regardless of locale).
- **Per-user accounts / sign-up flows** — out. The product's central premise is anonymous sharing. Identity belongs in the share's password / magic link, not in viewer accounts.
- **In-iframe content translation** — out. User HTML is a sealed artifact; we localize the wrapper, not the content.

## Context

**Technical environment:**
- Next.js 16 App Router (Turbopack) + React 19 + TypeScript
- Supabase (Postgres) for storage; RLS deny-all, service_role server-side only
- Auth.js v5 (next-auth) for Google OAuth admin
- Deployed on Vercel (`html2u.vercel.app`), GitHub auto-deploy from `tommyboy326/html2u`
- Codebase map at `.planning/codebase/` (7 documents, 1146 lines)

**Prior work & rationale:**
- v1 evolved from a private "share Claude's mid-stream HTML to a colleague" tool
  into a public anonymous service ("myppt.cc but for HTML pages"). The pivot
  reframed every security concern: the threat model is now "someone uploads
  phishing HTML to attack the viewer," not "someone snoops on a colleague's report."
- The "warm amber un-removable safety banner" was added at the user's suggestion
  ("此網頁是一次性展示網頁,不要填寫任何資料") — recognized as the strongest
  non-technical defense against visual phishing.

**Known issues / debt:**
- See `.planning/codebase/CONCERNS.md` for full inventory. Headlines:
  - No automated tests (build-verify only)
  - Dev-mode file store is single-process; not safe on serverless
  - `ADMIN_PASSWORD` fallback path still in code (intentional for dev)

## Constraints

- **Tech stack**: Next.js 16 + Supabase + Auth.js v5 + Vercel — locked; established and shipped
- **Hosting budget**: Vercel hobby tier — no paid features (BotID, advanced WAF) in this milestone
- **Translation budget**: zh-Hant + en in v1 to validate i18n architecture before paying for more locales
- **Schema migrations**: Backward-compatible only (production data lives in Supabase); no destructive changes without a deliberate migration step
- **Public-facing**: Anonymous service hosting third-party HTML — legal pages (ToS/Privacy/DMCA) are mandatory for v2
- **Performance**: Serverless cold-start tolerant; no long-running background processes
- **No regressions**: Existing v1 capabilities (CORE-01..04, SAFE-01..08, ADMIN-01..02, UX-01..03) must remain working

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Public anonymous service (vs private team tool) | User pivoted to "myppt-style" public hosting in milestone 1 | ✓ Good — shipped |
| Supabase Postgres (vs Vercel KV) | Need queryable admin dashboard + atomic one-time consume (UPDATE ... RETURNING) | ✓ Good — shipped |
| Auth.js Google + email allowlist (vs shared admin password) | No password to leak; Google handles MFA; only listed Gmail can sign in | ✓ Good — shipped |
| Strict CSP exfil-block by default (vs disabling JS) | JS-driven content still works (charts, animations); attacker can capture but cannot transmit | ✓ Good — shipped |
| Liquid Glass only on floating chrome (vs every surface) | Reconcile DESIGN.md's "no shadows on cards" with macOS 26 spec — apply glass where it's conceptually a chrome layer | ✓ Good — shipped |
| Skip BotID for v2 | Vercel Pro cost; Safe Browsing (SEC-01) covers worst-case abuse at zero cost | — Pending |
| Skip CONTENT_ORIGIN for v2 | Requires second domain purchase; sandbox + CSP already isolate content from main-app cookies/storage | — Pending |
| Cookie-based locale (vs URL prefix) | App is `noindex` so SEO is moot; preserves `/s/<id>` URLs across language changes | — Pending |
| zh-Hant + en for i18n v1; defer others | Validate the translation architecture before incurring translation cost on 3 more locales | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-29 after initialization (brownfield — v1 already shipped, v2 milestone being defined)*
