# Project Research Summary

**Project:** html2u v2 — Security Hardening + i18n Foundation
**Domain:** Public anonymous HTML-hosting service (pastebin-class), Next.js 16 App Router + Supabase + Auth.js v5 on Vercel, live at `https://html2u.vercel.app`
**Researched:** 2026-05-29
**Confidence:** HIGH on stack & architecture; HIGH on i18n UX; MEDIUM on SEC-04 legal-page operator inputs; HIGH on CSP / Safe-Browsing pitfall set

## Executive Summary

v2 adds two parallel workstreams to an already-shipped v1: **(a) Security Hardening** — Safe Browsing URL scan on upload, baseline security HTTP headers, CSP violation reporting + ingest, public legal pages, and an admin Security Status panel — and **(b) i18n Foundation** — server-side `Accept-Language` detection with cookie persistence, a Liquid-Glass language switcher, full zh-Hant + en string coverage, locale-aware metadata, and drop-in support for zh-Hans / ja / ko in v2.5. The locked stack (Next.js 16.2.6, React 19, Supabase, Auth.js v5, Vercel hobby) is **not re-litigated**; v2 is additive.

The 2026 consensus from four independent research dimensions converges on a minimal, mostly-native set of additions: **raw `fetch` against Safe Browsing v4** (do NOT install `@googleapis/safebrowsing` — 3 MB of transitive deps for a single POST), **`next.config.ts` `headers()`** for security headers (NOT `proxy.ts`, which Next.js 16 explicitly de-emphasized as a security boundary), **`next-intl` ^4.13 with `localePrefix: 'never'`** (cookie mode preserves `/s/<id>` URL stability), and a first-party `/api/csp-report` endpoint that handles both modern `application/reports+json` and legacy `application/csp-report` payloads. Total new runtime deps: `next-intl`, `@formatjs/intl-localematcher`, `negotiator`, `zod` (~22 KB combined gzipped). One new env var: `SAFE_BROWSING_API_KEY`. Zero new infrastructure cost.

The dominant risks are **not** "did we pick the right library" but **"did we wire the controls so they fail in the right direction"**: Safe Browsing must fail **closed** to `unknown` (not silently to `clean`); CSP reporting must dedupe + extension-filter + rate-limit at ingest or it becomes a DB-fill DoS amplifier within a week; HSTS on `.vercel.app` must NOT add `preload` or `includeSubDomains` (irreversible, redundant — Vercel already preloads `.vercel.app`); i18n locale must be **server-resolved exactly once per request** and passed as a prop (re-detecting via `navigator.language` produces React 19 hydration mismatches that blank the page); and SEC-04 legal copy must NOT promise a 30-day retention window the system can't keep — `pg_cron` is currently commented out per CONCERNS.md.

## Key Findings

### Recommended Stack

**New runtime dependencies:**

| Library | Version (May 2026) | Purpose | Cost |
|---------|--------------------|---------|------|
| `next-intl` | ^4.13.x | i18n core (provider, `getTranslations`, cookie-mode routing) | $0; ~12 KB gzip |
| `@formatjs/intl-localematcher` | ^0.5.x | BCP-47 quality-value-aware `Accept-Language` parsing | $0; ~3 KB |
| `negotiator` | ^1.0.x | next-intl matcher peer | $0; ~2 KB |
| `zod` | ^3.23.x | CSP report payload validation | $0; ~12 KB |
| `@types/negotiator` | dev-only | TypeScript types | $0 |

**Native / config-only additions:**
- Safe Browsing v4 Lookup via raw `fetch` (v4 sunsets 2027-03-31; v2 ships v4, queue v5 migration ticket Q1 2027; free tier 10k clients/24h; non-commercial only).
- Security headers in `next.config.ts` `async headers()` with per-route `source` scoping; NOT in `proxy.ts`.
- CSP Reporting: emit both modern `Reporting-Endpoints` + `report-to` AND legacy `report-uri` for Safari <17 / WebViews. NOT the deprecated capital-R `Report-To`.
- Legal pages = plain Server Components reading from `messages/{locale}.json` `legal.*` namespace (no MDX, no CMS).
- Security Status panel = single Server Component aggregator (60-s cached).

**New env var:** `SAFE_BROWSING_API_KEY` — server-only; NEVER `NEXT_PUBLIC_*`.

**Preserves:** strict per-response CSP on `/s/[id]/raw` stays as-is; new `NEXT_LOCALE` cookie (httpOnly: false, sameSite: lax, 1-year) added to any explicit Auth.js cookie allow-list.

### Expected Features (table-stakes)

- **SEC-01:** hard-reject on MALWARE / SOCIAL_ENGINEERING / UNWANTED_SOFTWARE; show which URL tripped; fail-open with `scan_status: 'unknown'` (NOT 'clean'); URL extraction covers `href`, `src`, `action`, `formaction`, inline `style: url(...)`, `<meta http-equiv="refresh">`.
- **SEC-02:** HSTS (no preload / no includeSubDomains per CRIT-3), nosniff, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy with `interest-cohort=()`, X-Frame-Options scoped to non-iframe routes.
- **SEC-03:** `/api/csp-report` accepting both content-types, rate-limited, deduped by `(document-uri-path, violated-directive, blocked-uri-host, source-file-host)`, extension noise filtered at ingest.
- **SEC-04:** `/tos`, `/privacy`, `/dmca` bilingual; footer links every page; "Last updated" dates; statutory 17 USC §512(c)(3) takedown fields.
- **I18N-01+02+03 bundle:** server-side BCP-47 matcher; native-language labels (`繁體中文` / `English`, NOT flags); globe icon trigger; top-right Liquid Glass pill; `NEXT_LOCALE` cookie wins over Accept-Language; full string coverage both locales.
- **SEC-05:** distribution / trend widgets, NOT reachability booleans (MOD-5).

**Differentiators:** per-share `scan_status` in admin, "Switch to your language?" dismissible hint, transparency note ("N takedowns in 2026"), 7-day CSP rollup chart, re-scan-on-view for old shares.

**Explicit anti-features (v2):** Vercel BotID, CONTENT_ORIGIN domain, zh-Hans/ja/ko translations, URL-prefix locale routing, ML phishing classifier, Puppeteer DOM scan, third-party CSP services, click-through agree wall, cookie banner, country-flag icons, in-iframe content translation, geo-IP detection, account-required DMCA.

### Architecture Approach

No new layers. Each requirement attaches to an existing layer:

| Requirement | Layer | New files |
|-------------|-------|-----------|
| SEC-01 | Business Logic + Action | `lib/safeBrowsing.ts`, call site in `createShareAction` after rate-limit before `createShare()` |
| SEC-02 | Cross-cutting config | `next.config.ts` `headers()` (per-route `source` scoping; exclude `/s/.*/raw`) |
| SEC-03 | API + Storage | `app/api/csp-report/route.ts` + `csp_violations` table + `Backend.recordCspViolation` |
| SEC-04 | Presentation | `app/tos/page.tsx`, `app/privacy/page.tsx`, `app/dmca/page.tsx` reading `messages/{locale}.json` |
| SEC-05 | Presentation + Business Logic | `app/_components/SecurityStatus.tsx`, `lib/securityChecks.ts`, `/admin/security` route |
| I18N-01 | Cross-cutting | `proxy.ts` (Next.js 16's renamed middleware) — matcher MUST exclude `/api`, `/_next`, `.*\..*` |
| I18N-02 | Presentation | `app/_components/LanguageToggle.tsx` Client Component → Server Action → cookie + `revalidatePath('/', 'layout')` |
| I18N-03 | Cross-cutting | `messages/{en,zh-Hant}.json`, `i18n/request.ts`, `i18n/routing.ts`, `NextIntlClientProvider` in root layout |
| I18N-04 | Presentation | `generateMetadata()` in pages; `<html lang={await getLocale()}>` in root |
| I18N-05 | Cross-cutting | drop-in property of how I18N-01..04 are wired |

**Patterns:**
- **Two CSPs, two homes.** `next.config.ts` for wrapper; per-response in `app/s/[id]/raw/route.ts`. Both emit `Reporting-Endpoints` + `report-to` with distinct `ctx=wrapper` vs `ctx=content` query params.
- **Translate at presentation, not at action.** Refactor `ActionState` from `{ error: string }` to `{ errorCode: 'RATE_LIMITED' | 'INVALID_HTML' | 'MALICIOUS_URL' | ... }`. Components map via `t('errors.${code}')`. Keeps `lib/` + actions locale-agnostic.
- **Server-resolve locale once, pass as prop.** Never re-derive in client via `navigator.language` or `Intl.DateTimeFormat(undefined, ...)` — source of CRIT-5.
- **Extend Backend interface, never bypass.** Preserves dev `FileBackend` swap.

### Critical Pitfalls (top 5)

1. **CRIT-1 — Safe Browsing silent fail-open (SEC-01).** Default `fetch` no timeout; `{matches: []}` == clean shape. **Defense:** 3s `AbortSignal.timeout`; verdict `'unknown'` on any non-200 NOT `'clean'`; persist per-URL not per-share; SEC-05 must show **verdict distribution** so 100% clean looks suspicious.
2. **CRIT-3 — HSTS preload + includeSubDomains on `.vercel.app` (SEC-02).** Vercel already preloads `.vercel.app`; adding includeSubDomains from a subdomain is redundant and locks future siblings. **Defense:** ship `max-age=63072000` only — NO preload, NO includeSubDomains. **NOTE:** STACK.md draft `headers()` example includes preload + includeSubDomains — this contradicts CRIT-3 and must be corrected before SEC-02 ships.
3. **CRIT-4 — `/api/csp-report` DB-fill DoS amplifier (SEC-03).** Chrome extensions emit hundreds of bogus reports per pageview; attackers can forge directly. Supabase 500 MB fills overnight. **Defense:** rate-limit 60/min/IP BEFORE DB write; 8 KB payload cap; content-type allowlist; dedupe with `count` column; extension-prefix filter (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`, `webkit-masked-url://`) at ingest; 30-day TTL.
4. **CRIT-5 — i18n hydration mismatch blanks the page (I18N-01/02/04).** Server reads Accept-Language; client re-derives via `navigator.language` → React 19 hard hydration error. **Defense:** server-resolved locale is sole source of truth via `NextIntlClientProvider`; cookie > Accept-Language > default; `<html lang={locale}>` from server root layout; date/number `Intl.DateTimeFormat(locale, ...)` with explicit locale arg never `undefined`; client-only locale UI gated in `useEffect` with SSR fallback. Test matrix: 4 combos of (cookie set/unset) × (browser EN/zh-Hant).
5. **CRIT-6 — Accept-Language picks wrong Chinese variant for HK/SG/CN (I18N-01).** Naïve `split` sends mainland users Traditional. **Defense:** `@formatjs/intl-localematcher`; documented zh-* mapping in code (`zh-Hant*` / `zh-TW` / `zh-HK` / `zh-MO` → zh-Hant; `zh-Hans*` / `zh-CN` / `zh-SG` / `zh-MY` → zh-Hant for v2 BUT log/count for v2.5 zh-Hans target; bare `zh` → zh-Hant per Taiwan-first); cookie stores BCP-47 with script tag (`zh-Hant` never `zh`) so v2.5 zh-Hans doesn't strand cookies.

**Honorable mentions:** CRIT-2 (Safe Browsing only sees extracted URLs — frame as "known-phishing-URL filter," pair with shortener resolve + brand-impersonation heuristics); MOD-3 (legal copy promising retention pg_cron can't keep — block SEC-04 on pg_cron enablement OR widen to "within 7 days"); MOD-4 (main-app CSP enforce breaks UX-02 inline theme bootstrap — Report-Only first, then nonce-or-hash).

## Implications for Roadmap

### Dependency Graph (explicit)

```
SEC-02 (headers + Reporting-Endpoints)
  ├──► SEC-03 (report-to lives in CSP that SEC-02 sets)
  │      └──► SEC-05 (CSP-reports widget needs counts)
  │
SEC-01 ──► scan_status column ──► SEC-05 (verdict-distribution widget)
  │
SEC-04 ──► requires I18N-03 provider live for bilingual rendering
       ──► requires pg_cron enabled OR relaxed retention SLA (open question)
  │
I18N-05 routing skeleton
  └──► I18N-01 (proxy.ts negotiation) ──┐
       │                                 ├── MUST ship in ONE phase (cookie/Accept-Language atomic)
       └──► I18N-02 (switcher r/w same NEXT_LOCALE cookie) ─┘
            └──► I18N-03 (string coverage; ActionState→errorCode refactor)
                 └──► I18N-04 (locale-aware <html lang>, generateMetadata)
                      └──► SEC-04 (bilingual legal copy)
```

**Hard ordering constraints:**
1. SEC-02 before SEC-03 (`report-to` lives in headers SEC-02 sets).
2. **I18N-01 + I18N-02 ship in the SAME phase** — cookie name (`NEXT_LOCALE`) and Accept-Language precedence must agree from day one; changing later breaks every existing visitor.
3. I18N-03 provider live before any string-extraction PR lands.
4. SEC-04 after I18N-03 provider AND after pg_cron decision.
5. SEC-05 last by construction (aggregates SEC-01/02/03/04 signals).

### Recommended Phase Shape (4 phases, coarse granularity)

**Phase 1 — Security Headers Foundation (SEC-02)**
- *Rationale:* `next.config.ts`-only; zero runtime risk; unblocks SEC-03.
- *Delivers:* HSTS (no preload, no includeSubDomains per CRIT-3); nosniff; Referrer-Policy; Permissions-Policy; X-Frame-Options scoped to exclude `/s/.*/raw`; `Reporting-Endpoints` + `report-to` in **Report-Only mode** for the wrapper (defends MOD-4).
- *Avoids:* CRIT-3, MOD-1, MOD-2, MOD-4, MOD-6.
- *Research flag:* None.

**Phase 2 — i18n Foundation Bundle (I18N-01..05)**
- *Rationale:* All five MUST ship together — cookie name, Accept-Language precedence, switcher persistence, string provider are one atomic surface; splitting creates CRIT-5 hydration window. Unblocks SEC-04.
- *Delivers:* `proxy.ts` next-intl middleware (matcher excludes `/api`, `/_next`, `.*\..*`); `i18n/request.ts` + `i18n/routing.ts` with `localePrefix: 'never'`; `messages/{en,zh-Hant}.json` full coverage; `LanguageToggle.tsx`; `<html lang>` from root layout; localized `generateMetadata`; `ActionState` errorCode refactor; CI key-parity check (MIN-1); explicit zh-* mapping table (CRIT-6); `ja` stub smoke test (validates I18N-05).
- *Uses:* `next-intl` ^4.13, `@formatjs/intl-localematcher`, `negotiator`.
- *Avoids:* CRIT-5, CRIT-6, MIN-1, MIN-2 (CJK font fallback), MIN-3 (switcher vs safety banner on `/s/[id]`), MIN-4 (meta constants in code).
- *Research flag:* **Low-medium** — verify `localePrefix: 'never'` no-`[locale]`-segment mode + Server-Action `revalidatePath('/', 'layout')` in Next.js 16 at planning.

**Phase 3 — Defense Verticals (SEC-01 + SEC-03 + SEC-04)**
- *Rationale:* Three near-disjoint verticals on Phase 1+2 foundations; parallelizable; bundled under coarse granularity.
- *Delivers:*
  - SEC-01: `lib/safeBrowsing.ts` (raw v4 fetch, 3s timeout, fail-closed `'unknown'`); call site post-rate-limit pre-`createShare`; `url_verdicts` cache table; additive `flagged_at`/`flag_reason`/`flag_urls` on `shares`; rejection explainer page.
  - SEC-03: `/api/csp-report/route.ts` (both content-types; 60/min/IP via existing `incrRate`; 8 KB cap; dedupe count column; extension-prefix filter; `ctx=wrapper|content` disambiguation; `csp_violations` 30-day TTL).
  - SEC-04: `/tos`, `/privacy`, `/dmca` Server Components from `messages.legal.*`; footer + locale-aware "Last updated"; statutory §512(c)(3) fields; EN binding (MOD-3); explicit jurisdiction + DMCA agent (gated on operator inputs).
- *Uses:* `zod`, Safe Browsing v4.
- *Avoids:* CRIT-1, CRIT-2, CRIT-4, MIN-5, MOD-3.
- *Research flag:* **Medium for SEC-04 copy** (human-reviewed bilingual legal language; operator inputs gate); **Low for SEC-01 / SEC-03**.

**Phase 4 — Security Status Capstone (SEC-05)**
- *Rationale:* Aggregates all prior signals; ships last by construction; also acts as acceptance test for Phase 3 (verdict distribution shows whether CRIT-1 is in effect).
- *Delivers:* `/admin/security` Server Component + `GET /api/admin/security-status` (60s cache). Widgets per MOD-5 (distribution NOT booleans): Safe Browsing verdict distribution + p95 latency + 7d lookup count; headers self-check via HEAD `/` parsing actual values; CSP deduped count by directive + top-10 blocked-URIs; flagged-shares pending queue; legal-page last-modified + git SHA; documented manual checklist with Google's test URLs.
- *Avoids:* MOD-5 (primary defense against silent CRIT-1/CRIT-4 failure).
- *Research flag:* None.

### Phase Ordering Rationale

- Phase 1 first because `Reporting-Endpoints` is the upstream sender for SEC-03.
- Phase 2 second because SEC-04 needs bilingual rendering, the errorCode refactor should precede SEC-01's new error path, and cookie name must lock before users accumulate.
- Phase 3 internally parallelizable (disjoint files); coarse-grained bundles them.
- Phase 4 last by SEC-05's aggregator nature.

### Research Flags

- **Phase 2:** Low-medium — verify next-intl ^4.13 `localePrefix: 'never'` no-`[locale]` setup + Next.js 16 `revalidatePath` scope.
- **Phase 3 (SEC-04 only):** Medium — operator inputs + bilingual legal review gate.
- **Phases 1, 3 (SEC-01/03), 4:** No deeper research needed — well-documented patterns.

## Open Questions for Operator

1. **Operator legal jurisdiction — Taiwan or US?** Affects `/tos` governing-law, `/privacy` data-controller, `/dmca` framework (17 USC §512 vs TW equivalent). **Blocks Phase 3 (SEC-04).**
2. **Register US Copyright Office DMCA designated agent?** Without registration + published name, `/dmca` is decorative not protective. Operator may be unwilling for an anonymous service. **Blocks Phase 3 (SEC-04 acceptance criteria).**
3. **Enable pg_cron in v2?** Currently commented per CONCERNS.md. If disabled, widen SEC-04 retention copy to "within 7 days" AND implement SEC-03 `csp_violations` 30-day TTL in application code. **Blocks Phase 3 (SEC-04 + SEC-03 TTL).**
4. **v2 main-app (wrapper) CSP tightening — in scope or only the discrete SEC-02 headers + SEC-03 reporting infra?** PROJECT.md ambiguous. If in scope: MOD-4 Report-Only-first rollout + UX-02 inline theme bootstrap needs nonce-or-hash. If out: SEC-03 only ingests from existing strict `/s/[id]/raw` CSP. **Blocks Phase 1 scope + Phase 3 SEC-03 design.**
5. **Safe Browsing v4 daily-quota meter needed in v2?** 10k/24h can blow from a single scraper. CRIT-1 mandates fail-closed regardless, but operator may want a SEC-05 indicator before quota is hit. If yes: per-day-bucket counter in DB + SEC-05 "quota remaining" widget. **Blocks Phase 3 (SEC-01 telemetry) + Phase 4 (SEC-05 widget).**

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Library versions verified May 2026; Next.js 16 `headers()` + `proxy.ts` rename per official docs; next-intl ^4.13 cookie-mode per next-intl.dev; Safe Browsing v4 + 2027-03-31 sunset per developers.google.com |
| Features | HIGH on legal minimums, CSP noise filtering, switcher UX (4 converging sources); MEDIUM on Safe-Browsing-as-gate UX (no comparable service publishes playbook) |
| Architecture | HIGH for stack-native patterns; MEDIUM for SEC-01 placement inside Server Action (no canonical Next.js 16 reference for external safety-API placement) |
| Pitfalls | MEDIUM-HIGH overall — CRIT-1/4/5 vs MDN + Next.js + Dropbox production; CRIT-3 vs OWASP + Vercel; CRIT-6 vs polylang + Drupal historical bugs; MOD-3 vs US Copyright Office primary source |

**Overall confidence:** HIGH for stack and architecture; MEDIUM-HIGH for the full v2 program contingent on operator answering the 5 open questions.

### Gaps to Address

- **Safe Browsing v5 migration window.** Add 2027-Q1 reminder ticket; v5 hash-prefix protocol is a non-trivial swap, out of scope for v2.
- **next-intl no-`[locale]`-segment mode validation.** Phase 2 planning should prototype.
- **Vercel header-merge precedence on `/s/[id]/raw`.** Phase 1 acceptance test: `curl -I` raw route, confirm no wrapper-header leakage.
- **STACK.md draft `headers()` example contradicts CRIT-3 on HSTS.** Flag for Phase 1 executor — follow CRIT-3, not the STACK.md draft.
- **Operator inputs (5 open questions).** Cannot be resolved by research; gate Phase 3.
