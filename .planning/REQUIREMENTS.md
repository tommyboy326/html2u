# Requirements: html2u v2 — Security Hardening + i18n Foundation

**Defined:** 2026-05-29
**Core Value:** The link the user sends to their counterpart shows the HTML they intended — nothing else gets to steal data, hijack the tab, or weaponize the page against the viewer.
**Milestone:** v2 (additive on top of shipped v1; v1 capabilities are in `.planning/PROJECT.md` "Validated" section)

## v2 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Security

- [ ] **SEC-01**: On share creation, every URL extracted from the HTML (`href`, `src`, `action`, `formaction`, inline `style: url(...)`, `<meta http-equiv="refresh">`) is checked against **Google Safe Browsing v5**; share is rejected with explainer if any URL matches MALWARE / SOCIAL_ENGINEERING / UNWANTED_SOFTWARE; on API timeout / quota error the verdict is `'unknown'` (NOT `'clean'`), 3s `AbortSignal.timeout`, verdicts cached per-URL
- [ ] **SEC-02**: Baseline security HTTP headers ship globally via `next.config.ts` `headers()` (NOT `proxy.ts`): HSTS `max-age=63072000` only (NO `preload`, NO `includeSubDomains` per CRIT-3 — Vercel already preloads `.vercel.app`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=() microphone=() geolocation=() interest-cohort=()`, `X-Frame-Options: DENY` scoped to non-iframe routes (excludes `/s/.*/raw`)
- [ ] **SEC-02b**: Wrapper-page CSP in **Report-Only mode** ships in the same phase as SEC-02; emits modern `Reporting-Endpoints` + `report-to` directives plus legacy `report-uri` fallback; provides the upstream sender for SEC-03; does NOT enforce in v2 (avoids breaking UX-02 inline theme bootstrap)
- [ ] **SEC-03**: CSP violation reports ingest at `POST /api/csp-report` accepting both `application/reports+json` (modern Reporting API array) and `application/csp-report` (legacy single object); rate-limited to 60/min/IP via existing `lib/shares.rateLimit` BEFORE DB write; 8 KB payload cap; content-type allowlist; extension-prefix filter (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`, `webkit-masked-url://`) drops noise at ingest; deduped by `(document_uri_path, directive, blocked_host, source_host)` with a `count` column; `csp_violations` row TTL = 30 days via `pg_cron`
- [ ] **SEC-04**: Public legal pages `/tos`, `/privacy`, `/dmca` ship as Server Components reading from `messages/{en,zh-Hant}.json` `legal.*` namespace; bilingual zh-Hant + en; **TW jurisdiction** for governing law (US DMCA designated agent NOT registered — see Out of Scope); statutory §512(c)(3) takedown fields included as informational; `/dmca` provides an `abuse@` contact for takedown requests; "Last updated" date per page; footer link from every page; English binding language clause; retention copy promises "30 days" (now truthful because pg_cron is enabled per SEC-OPS-01)
- [ ] **SEC-05**: Admin Security Status panel at `/admin/security` (Server Component, 60s cached) — distribution / trend widgets only, NOT booleans (per MOD-5): Safe Browsing verdict distribution (clean / flagged / unknown) + p95 latency + 7-day lookup count + **today's quota remaining**; security-headers self-check via `HEAD /` parsing actual response headers; CSP violations deduped count by directive + top-10 blocked hosts + 7-day rollup chart; flagged-shares pending queue; legal-page last-modified + git SHA; documented manual weekly checklist including known-malicious Google test URLs

### Operations

- [ ] **SEC-OPS-01**: Supabase `pg_cron` extension is enabled in the production project and `cron.schedule` is committed for (a) `delete from shares where expires_at < now()`, (b) `delete from rate_limits where expires_at < now()`, (c) `delete from csp_violations where created_at < now() - interval '30 days'`; schema.sql updated to commit these `cron.schedule` calls (uncomments the previously-commented block)

### Internationalization

> Per pitfalls research (CRIT-5, CRIT-6), I18N-01..05 ship in ONE atomic phase. The cookie name (`NEXT_LOCALE`) and Accept-Language precedence are interdependent; splitting creates a hydration window or strands cookies.

- [ ] **I18N-01**: Automatic locale negotiation runs server-side via `proxy.ts` (Next.js 16's renamed middleware), using `next-intl` 4.13 + `@formatjs/intl-localematcher` + `negotiator`; precedence is `NEXT_LOCALE` cookie > `Accept-Language` > default `zh-Hant`; cookie stores BCP-47 with script tag (`zh-Hant`, never `zh`); explicit zh-* mapping in code: `zh-Hant-*` / `zh-TW` / `zh-HK` / `zh-MO` → `zh-Hant`; `zh-Hans-*` / `zh-CN` / `zh-SG` / `zh-MY` → `zh-Hant` for v2 (logged for v2.5 demand validation); bare `zh` → `zh-Hant`; matcher excludes `/api`, `/_next`, `.*\..*`
- [ ] **I18N-02**: Top-right language switcher (Liquid Glass pill matching theme toggle style) ships in the same phase as I18N-01; trigger is a globe icon + native-language label (`繁體中文` / `English`, NEVER country flags); selection invokes a Server Action that writes `NEXT_LOCALE` cookie + `revalidatePath('/', 'layout')`; hidden on `/s/[id]` viewer page (matches existing ThemeToggle hiding)
- [ ] **I18N-03**: Full UI string coverage in `messages/{en,zh-Hant}.json` for every visible string in home, share view (password form, magic landing, safety banner copy), admin (login + dashboard + security panel), API error responses, and legal pages; `app/actions.ts` `ActionState` refactored from `{ error: string }` to `{ errorCode: 'RATE_LIMITED' | 'INVALID_HTML' | 'MALICIOUS_URL' | 'PASSWORD_REQUIRED' | 'BAD_PASSWORD' | 'LINK_EXPIRED' | 'INTERNAL' }`; components map codes via `t('errors.${code}')` so `lib/` and actions stay locale-agnostic; CI key-parity check ensures both locale files have identical keys
- [ ] **I18N-04**: Locale-aware metadata — every page's `generateMetadata()` returns locale-translated `<title>` and `<meta description>`; root `<html lang={await getLocale()}>` set server-side; `robots` meta NOT translated (stays as machine values)
- [ ] **I18N-05**: Translation infrastructure is drop-in for additional locales — adding `messages/ja.json` (or `zh-Hans.json`, `ko.json`) requires zero code changes; a `ja` stub messages file is shipped to validate this in v2; matcher and switcher both pick it up automatically; release script for adding a locale documented in `CONTRIBUTING.md` or equivalent

## v3 Requirements

Acknowledged for the next milestone after v2; not in current roadmap.

### Security (deferred)

- **SEC-V3-01**: Vercel BotID — sophisticated bot/automation defense for create endpoint (requires Vercel Pro)
- **SEC-V3-02**: `CONTENT_ORIGIN` separate content domain — main-domain reputation isolation (requires second domain purchase; architecture already plumbed)
- **SEC-V3-03**: Report categorization (phishing / malware / copyright / other) + admin email notifications above threshold
- **SEC-V3-04**: Max TTL cap below 30 days for specific abuse signals; scheduled mid-life re-scan
- **SEC-V3-05**: Wrapper CSP enforce mode (requires inline-theme-bootstrap nonce-or-hash refactor)
- **SEC-V3-06**: Safe Browsing v4 → v5 migration before 2027-03-31 sunset

### Internationalization (deferred)

- **I18N-V3-01**: `zh-Hans` full translation
- **I18N-V3-02**: `ja` full translation
- **I18N-V3-03**: `ko` full translation
- **I18N-V3-04**: "Switch to your language?" hint banner when `Accept-Language` differs from active locale and no cookie set

## Out of Scope

Explicitly excluded. Documented to prevent scope creep or re-litigation.

| Feature | Reason |
|---------|--------|
| US DMCA designated-agent registration | Per operator decision: TW jurisdiction with email-based takedown is the legal baseline for v2; US safe-harbor registration ($6/year) skipped because the service is anonymous-friendly and not US-based |
| URL-prefix locale routing (`/en/`, `/zh-Hant/`) | App is `noindex` so SEO is not a factor; cookie-based switching preserves `/s/<id>` URL stability across language changes |
| Country-flag icons in language switcher | Research convergence (Smashing, Fastly, Smart Interface Design Patterns, Smartling): flags conflate language with nationality and offend users; use native-language labels with a globe icon |
| Click-through agree wall / cookie consent banner | Anonymous service with no persistent identifiers beyond IP (logged with disclosure in `/privacy`) and a locale cookie; consent banner adds friction without legal upside in TW jurisdiction |
| Geo-IP language detection | Privacy risk + VPN false negatives + research-consensus that `Accept-Language` + cookie is enough |
| In-iframe content translation | User HTML is a sealed artifact; we localize the wrapper, not the content (also a security boundary) |
| ML-based phishing classifier | Out of v2 budget and scope; Safe Browsing v5 + URL extraction is the chosen control surface |
| Puppeteer / headless-browser DOM scanning before storage | Latency + cost + only marginal benefit over static URL extraction |
| Third-party CSP report aggregation services (csper.io, Report URI) | First-party endpoint with DB storage is sufficient; avoids new vendor dependency and PII transit |
| Account-required DMCA takedown form | Anonymous service principle; email + form is sufficient for §512(c)(3) compliance |
| Per-user accounts / viewer sign-up flows | Anonymous service is the design; identity belongs in the share's password / magic link |

## Traceability

Populated by the roadmapper agent during ROADMAP.md creation (2026-05-29).

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-02 | Phase 1 — Security Headers Foundation | Pending |
| SEC-02b | Phase 1 — Security Headers Foundation | Pending |
| SEC-OPS-01 | Phase 1 — Security Headers Foundation | Pending |
| I18N-01 | Phase 2 — i18n Foundation Bundle | Pending |
| I18N-02 | Phase 2 — i18n Foundation Bundle | Pending |
| I18N-03 | Phase 2 — i18n Foundation Bundle | Pending |
| I18N-04 | Phase 2 — i18n Foundation Bundle | Pending |
| I18N-05 | Phase 2 — i18n Foundation Bundle | Pending |
| SEC-01 | Phase 3 — Defense Verticals | Pending |
| SEC-03 | Phase 3 — Defense Verticals | Pending |
| SEC-04 | Phase 3 — Defense Verticals | Pending |
| SEC-05 | Phase 4 — Security Status Capstone | Pending |

**Coverage:**
- v2 requirements: 12 total
- Mapped to phases: 12 ✓
- Unmapped: 0
- Orphaned: 0
- Duplicated: 0

---
*Requirements defined: 2026-05-29*
*Last updated: 2026-05-29 after roadmap creation — traceability populated, all 12 requirements mapped*
