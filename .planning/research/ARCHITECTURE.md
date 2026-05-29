# Architecture Patterns — v2 Integration

**Domain:** Security hardening + i18n integration into existing Next.js 16 App Router app
**Researched:** 2026-05-29
**Confidence:** HIGH for stack-native patterns (next.config headers, next-intl, route handlers); MEDIUM for Safe Browsing placement (one verified pattern; alternatives plausible but not validated)

## Architectural North Star

**Do not redesign the existing system.** Each v2 requirement is a leaf that attaches to a clearly defined existing layer (presentation, action, business logic, storage, or cross-cutting). Where a v2 requirement matches an existing layer's responsibility, extend that layer; do not create a new layer.

Mapping at a glance:

| Requirement | Layer it plugs into | Net-new files |
|-------------|---------------------|---------------|
| SEC-01 Safe Browsing | Business Logic (`lib/`) → called from Action Layer (`app/actions.ts`) | `lib/safeBrowsing.ts` |
| SEC-02 Security headers | Cross-cutting (build config) | edits to `next.config.ts` (+ optional `proxy.ts`) |
| SEC-03 CSP reports | Presentation/API (`app/api/`) + Storage (`lib/backend.ts`) | `app/api/csp-report/route.ts`, new backend method |
| SEC-04 Legal pages | Presentation (`app/`) | `app/tos/page.tsx`, `app/privacy/page.tsx`, `app/dmca/page.tsx` (+ optional `content/legal/*.md`) |
| SEC-05 Security panel | Presentation (`app/admin/`) + Business Logic | `app/_components/SecurityStatus.tsx`, `lib/securityChecks.ts` |
| I18N-01 Detection | Cross-cutting (proxy/middleware) | `proxy.ts` (or extend if already present) |
| I18N-02 Switcher | Presentation (`app/_components/`) | `LanguageToggle.tsx` |
| I18N-03 Coverage | Cross-cutting (messages) | `messages/en.json`, `messages/zh-Hant.json`, `i18n/request.ts` |
| I18N-04 Locale metadata | Presentation (root layout + pages) | edits to `app/layout.tsx` + `generateMetadata` exports |
| I18N-05 Drop-in locales | Cross-cutting (config) | `i18n/routing.ts` (or `i18n/config.ts`) — already plural |

---

## Component Boundaries — File-by-File

### SEC-01 Safe Browsing URL scan

**New module:** `lib/safeBrowsing.ts`
- Exports: `extractUrls(html: string): string[]`, `scanUrls(urls: string[]): Promise<ScanResult>`
- `ScanResult` shape: `{ verdict: "clean" | "flag" | "block"; matches: ThreatMatch[]; cachedAt?: number }`
- Reads `GOOGLE_SAFE_BROWSING_API_KEY` via `lib/config.ts` (add it there, not here)
- Calls `https://safebrowsing.googleapis.com/v4/threatMatches:find` with up to 500 URLs per POST
- Honors `cacheDuration` from response — store per-URL verdicts in backend cache table (see below) keyed by SHA-256 of normalized URL
- Returns `{ verdict: "clean" }` immediately if `GOOGLE_SAFE_BROWSING_API_KEY` is absent (graceful degradation in dev)

**Call site:** `app/actions.ts:createShareAction` (and the JSON twin in `app/api/shares/route.ts`)
- Runs **synchronously after** the rate-limit check and **before** `createShare()` so a blocked share never lands in storage
- On `verdict === "block"` → return `ActionState { error: "URL flagged as malicious" }`
- On `verdict === "flag"` → still create share but set `flagged_at = now()`; admin reviews
- On `verdict === "clean"` → proceed normally

**Storage:**
- Extend `Backend` interface (`lib/backend.ts:52`) with `getUrlVerdict(urlHash)` / `setUrlVerdict(urlHash, verdict, expiresAt)`
- New Supabase table `url_verdicts(url_hash text pk, verdict text, threat_type text, expires_at timestamptz)` in `supabase/schema.sql`
- Add `flagged_at`, `flag_reason`, `flag_urls jsonb` columns to `shares` (nullable, additive, backward-compatible)

**Why this placement (not middleware, not lib/shares.ts):**
- Middleware runs on every request — wasteful and adds latency to viewer requests that don't create shares
- `lib/shares.ts createShare()` is pure persistence — keeping it side-effect-free preserves testability and lets future code paths (e.g., admin re-scan) call `scanUrls()` independently
- Action layer is where rate-limit and external IO concerns already live (`rateLimit()` next to `createShare()` in `app/actions.ts:120`)

**Sync vs async:** Synchronous. A flagged URL must never produce a share record. Safe Browsing P95 is ~200ms with caching; well under a typical Server Action budget. Cold-start risk is acceptable since share creation is already an interactive form submit.

### SEC-02 Security headers

**Placement:** `next.config.ts` `headers()` block — global static headers for the entire app.

```ts
async headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
    {
      source: "/((?!s/.*/raw).*)",  // exclude raw HTML route — keep its dedicated CSP
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "<app-wrapper CSP — see SEC-03>" },
      ],
    },
  ];
}
```

**Critical interaction with existing `/s/[id]/raw/route.ts`:** that route's response headers (set via `new Response(html, { headers })`) take precedence over `next.config.ts` headers for that exact response per Next.js header merge rules. Verify by inspection; if `next.config` headers leak into the raw route, exclude `/s/.*/raw` from the global block via the `source` regex (shown above).

**Do NOT use middleware for SEC-02.** SEC-02 headers are static; static headers in `next.config.ts` are the documented idiomatic approach in Next 16 ([Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)). Move to `proxy.ts` (Next 16's renamed middleware — was `middleware.ts` pre-16) **only** if SEC-03's CSP requires per-request nonces. The current strict CSP in `app/s/[id]/raw/route.ts:46` already runs without nonces; the wrapper CSP for SEC-03 can also be nonce-free if no inline scripts in the wrapper need it.

### SEC-03 CSP violation reporting

**New endpoint:** `app/api/csp-report/route.ts`
- Handles `POST` with `Content-Type: application/csp-report` (legacy `report-uri`) OR `application/reports+json` (new `Reporting-Endpoints`). Accept both — modern browsers send the new format, older ones send legacy.
- Body shapes differ; normalize into `CspViolation { blockedUri, documentUri, violatedDirective, effectiveDirective, disposition, statusCode, sourceFile, lineNumber, sample, userAgent, occurredAt }`
- Rate-limit per IP via existing `rateLimit()` infrastructure (`lib/shares.ts:119`) — CSP report storms are a real DoS vector
- Insert into `csp_violations` table via new `Backend.recordCspViolation()` method
- Return `204 No Content` always (never leak internal state to a malicious reporter)

**Where the CSP comes from:**
- The **wrapper CSP** (applied via `next.config.ts` headers from SEC-02) gets `report-to wrapper-endpoint` and a `Reporting-Endpoints: wrapper-endpoint="/api/csp-report?ctx=wrapper"` header
- The **content CSP** in `app/s/[id]/raw/route.ts:46` adds `report-to content-endpoint` and `Reporting-Endpoints: content-endpoint="/api/csp-report?ctx=content"`
- The `ctx` query param disambiguates which CSP fired the violation — store it in the row to keep admin filtering useful

**Storage:** New table `csp_violations(id uuid pk, share_id text null, ctx text, document_uri text, blocked_uri text, violated_directive text, sample text, user_agent text, ip inet, occurred_at timestamptz)`. `share_id` is nullable because wrapper violations aren't share-scoped; content violations should parse `documentUri` → `/s/[id]/raw` → extract `id`.

**Why a separate endpoint, not the existing `/api/report`:** `/api/report` is for human abuse reports tied to a specific share with a different schema (counter increment on `shares.report_count`). CSP reports are machine-generated, high-volume, and structurally different. Reusing the endpoint would conflate two domains.

### SEC-04 Legal pages

**Placement:** Server Component pages at fixed routes, content loaded from bundled markdown.

```
app/tos/page.tsx          → renders messages from content/legal/tos.{locale}.md
app/privacy/page.tsx      → renders messages from content/legal/privacy.{locale}.md
app/dmca/page.tsx         → renders messages from content/legal/dmca.{locale}.md
content/legal/tos.en.md
content/legal/tos.zh-Hant.md
content/legal/privacy.en.md
content/legal/privacy.zh-Hant.md
content/legal/dmca.en.md
content/legal/dmca.zh-Hant.md
```

**Content strategy:**
- Markdown files bundled in repo (not in DB) — legal copy is versioned with code, reviewed via PR, no admin UI risk
- Parse with `react-markdown` (small, no plugins needed for plain prose) at build time via direct `fs.readFile` in the Server Component
- Page reads `getLocale()` from next-intl request config (see I18N-01) to pick the right markdown file
- Fall back to `en` if requested locale is missing

**Footer link:** Add to `app/layout.tsx` — small footer with three links visible on every page. Tiny links satisfy the "is the ToS reachable from anywhere on the site?" legal due diligence expectation.

**Why Server Component pages, not a `[slug]` catch-all:** Three pages, fixed list, indexed by humans (DMCA agent will paste `/dmca` into forms). Separate routes are clearer, faster, easier to give distinct `<title>` metadata.

### SEC-05 Admin Security Status panel

**Placement:** `app/admin/page.tsx` renders a new `<SecurityStatus />` server component above the share list.

**New files:**
- `lib/securityChecks.ts` exports `runSecurityChecks(): Promise<SecurityCheckResult[]>`
  - `safeBrowsingHealthy()` — sends test query to API, returns latency + ok flag
  - `securityHeadersPresent()` — fetches `${BASE_URL}/` with `Authorization: Bearer ${ADMIN_PROBE_TOKEN}`, inspects response headers (works locally + on Vercel since serverless functions can self-fetch)
  - `cspReportsLastWeek()` — `backend().countCspViolations({ since: now - 7d })`
  - `flaggedSharesPending()` — `backend().countFlaggedShares({ reviewed: false })`
- `app/_components/SecurityStatus.tsx` — pure-render server component receiving the result array

**Caching:** Wrap `runSecurityChecks()` with React `cache()` for request-level dedup; do NOT use `revalidate` — admin expects fresh data on refresh. If header probe latency hurts, gate it behind an explicit "Re-run checks" button (Server Action).

**Manual checklist:** Render a static list of items from `content/security-checklist.md` — bundled, version-controlled, no DB. Last-completed timestamp can be stored per-admin in `admin_audit` table (out of scope for v2 if too much).

### I18N-01 Locale detection

**Placement:** `proxy.ts` at project root (Next.js 16 renames `middleware.ts` → `proxy.ts`; export function name is `proxy` not `middleware`). ([next-intl middleware docs](https://next-intl.dev/docs/routing/middleware))

**Strategy:** next-intl built-in middleware with `localePrefix: "never"` — keeps URLs locale-free (preserves `/s/<id>` shareability per the PROJECT.md key decision) but still negotiates `Accept-Language` and sets `NEXT_LOCALE` cookie. ([next-intl routing config](https://next-intl.dev/docs/routing/configuration))

```ts
// proxy.ts
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
export default createMiddleware(routing);
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
```

**Critical interaction:** `proxy.ts` middleware runs on every matched request. Existing app has no middleware today, so this is net-new behavior. Verify the matcher excludes `/api/*` so the existing API routes (`/api/shares`, `/api/report`, `/api/auth/*`, new `/api/csp-report`) are NOT rewritten.

**Cascade:** URL prefix → `NEXT_LOCALE` cookie → `Accept-Language` header → `defaultLocale: "zh-Hant"`. Since URL prefix is disabled, effectively: cookie → header → default.

### I18N-02 Language switcher

**New component:** `app/_components/LanguageToggle.tsx` ("use client")
- Renders Liquid Glass pill matching `ThemeToggle.tsx` style (see existing component)
- On change, calls a Server Action `setLocaleAction(locale)` in `app/actions.ts` that sets `NEXT_LOCALE` cookie and calls `revalidatePath("/", "layout")` to re-render with new messages
- Renders next to `<ThemeToggle />` in `app/layout.tsx` — both are top-right floating chrome

**Why not pure client-side `document.cookie`:** Cookie writes from client don't trigger Server Component re-render; user would see stale strings until next navigation. Server Action + `revalidatePath` flips the locale atomically.

### I18N-03 Translation coverage

**Provider placement:** `app/layout.tsx` wraps `{children}` in `<NextIntlClientProvider>`. Provider reads messages from `getMessages()` (next-intl) which in turn reads `i18n/request.ts`. ([next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router))

```tsx
// app/layout.tsx (skeleton)
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <ThemeToggle />
          <LanguageToggle />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Message file layout:**
```
messages/en.json
messages/zh-Hant.json
i18n/request.ts          → getRequestConfig — reads NEXT_LOCALE cookie, loads messages/[locale].json
i18n/routing.ts          → defineRouting({ locales: ['en','zh-Hant'], defaultLocale: 'zh-Hant', localePrefix: 'never' })
```

**Translation key naming:** Namespace by surface (`home.title`, `share.unlockButton`, `admin.deleteConfirm`, `errors.rateLimited`). Aligns with how next-intl `useTranslations('home')` scopes lookups.

**Strings to extract:** Every literal string in `app/page.tsx`, `app/s/[id]/page.tsx`, `app/m/[id]/[token]/page.tsx`, `app/admin/page.tsx`, all `_components/*.tsx`, error messages in `app/actions.ts` (translate at presentation, not at action — return error codes from actions, map to strings in components).

**Action returns:** Refactor `ActionState` from `{ error: string }` to `{ errorCode: "RATE_LIMITED" | "INVALID_HTML" | ... }`. Client uses `t(\`errors.${errorCode}\`)` for the display. Action layer becomes locale-agnostic — correct separation of concerns.

### I18N-04 Locale-aware metadata

**Placement:** `generateMetadata()` async export in each page file (`app/page.tsx`, `app/s/[id]/page.tsx`, etc.)
- Uses `getTranslations('metadata')` from next-intl in server context
- Sets `title`, `description` from messages
- Root `<html lang={locale}>` already handled by `app/layout.tsx` from I18N-03

### I18N-05 Drop-in locale capability

**Test:** Adding `ja` should require: (1) create `messages/ja.json`, (2) add `'ja'` to `locales` in `i18n/routing.ts`, (3) add display name to `LanguageToggle.tsx` option list. No other code changes. Build the architecture so this is true; verify by actually doing it as a smoke test (even with machine-translated stub strings).

---

## Data Flow — New Endpoints

### Share creation (with SEC-01)

```
Browser → CreateForm.tsx
  → createShareAction (app/actions.ts)
    → rateLimit() [existing]
    → extractUrls(html) [SEC-01, new]
    → scanUrls(urls) [SEC-01, new]
        → check backend().getUrlVerdict(urlHash) cache
        → if miss: POST safebrowsing.googleapis.com/v4/threatMatches:find
        → backend().setUrlVerdict(...) for each result
    → if verdict===block: return { errorCode: "MALICIOUS_URL" }
    → if verdict===flag: persist with flagged_at set
    → createShare() [existing]
    → return ActionState
```

### CSP violation report ingestion

```
Browser (CSP violation)
  → POST /api/csp-report?ctx=wrapper (or ?ctx=content)
    Content-Type: application/reports+json OR application/csp-report
  → app/api/csp-report/route.ts
    → rateLimit({ ip, scope: "csp_report" })
    → normalize body (handle both shapes)
    → backend().recordCspViolation(normalized)
    → return 204 No Content
```

### Locale negotiation on first visit

```
Browser GET / (no NEXT_LOCALE cookie, Accept-Language: zh-TW,en;q=0.8)
  → proxy.ts (next-intl middleware)
    → cascade: URL prefix (none) → cookie (none) → Accept-Language → "zh-Hant"
    → rewrite request internally to /zh-Hant (invisible to client)
    → set NEXT_LOCALE=zh-Hant on response (if header negotiation happened)
  → app/layout.tsx
    → getLocale() returns "zh-Hant"
    → getMessages() loads messages/zh-Hant.json
    → renders <html lang="zh-Hant"> with NextIntlClientProvider
  → app/page.tsx
    → useTranslations('home') resolves strings server-side
```

---

## Suggested Build Order (Dependency Graph)

```
SEC-02 (headers in next.config.ts) ─────┐
                                        ├──→ SEC-03 (CSP report endpoint + wrapper CSP)
SEC-04 (legal pages) ───────────────────┘     │
                                              ├──→ SEC-05 (status panel can probe headers + count reports)
SEC-01 (Safe Browsing) ───────────────────────┘

I18N-05 (routing config skeleton) → I18N-01 (proxy detection) → I18N-03 (messages + provider) → I18N-04 (metadata) → I18N-02 (switcher)
                                                                  ↑
                                                                  └── SEC-04 legal pages depend on I18N-03 for bilingual rendering
```

**Recommended phase order:**

1. **Phase A — Foundations that everything else builds on**
   - SEC-02 (headers config) — touches `next.config.ts` only; zero risk; unblocks SEC-03 CSP path; no dependencies
   - I18N-05 + I18N-01 + I18N-03 skeleton — establish routing config, proxy, provider in layout; use English-only stubs initially. Doing the wiring before string extraction lets you incrementally translate without re-touching infra
   - **Gate:** Both must be merged before any UI-touching work below; otherwise every PR conflicts in `app/layout.tsx`

2. **Phase B — Vertical slices on stable foundations**
   - SEC-01 (Safe Browsing) — independent vertical: new `lib/` module, schema additions, action-layer call site. Can ship in isolation.
   - SEC-03 (CSP reporting) — depends on SEC-02 headers existing (add `report-to` to those headers). Adds new endpoint, new backend method, new table.
   - I18N-03 string extraction — fill in messages files; refactor `ActionState` to error codes; update components to use `useTranslations`. Can parallelize with SEC-01/SEC-03 since file overlap is low.
   - I18N-04 metadata — small, parallel to anything.
   - SEC-04 legal pages — depends on I18N-03 provider being live. Can ship as English-first then add zh-Hant copy.

3. **Phase C — Capstones that require A+B done**
   - I18N-02 language switcher — depends on I18N-01+03 (cookie + provider) AND on SEC-04 existing so switching languages on a legal page is meaningful
   - SEC-05 security status panel — depends on SEC-01 (count flagged), SEC-02 (probe headers), SEC-03 (count violations). Last by definition.

**Critical ordering constraints (do not violate):**
- SEC-02 before SEC-03: `report-to` directive lives in the CSP that SEC-02 sets globally. Building SEC-03 first means writing a route handler that has no upstream sender.
- I18N-01 (proxy) before I18N-03 (provider): provider's `getLocale()` returns nothing useful without locale negotiation in place.
- I18N-03 provider before any string extraction PRs: extracting strings without a provider crashes pages at render.
- SEC-04 legal copy can be drafted in parallel but the **pages must render after I18N-03 provider lives**.

---

## Patterns to Follow

### Pattern 1: Extend the Backend interface, never bypass it

**What:** Every new persistent operation (URL verdict cache, CSP violations, flagged share count) adds a method to `Backend` in `lib/backend.ts:52` and implementations in both `SupabaseBackend` and `FileBackend`.

**When:** Always, when v2 needs new persistence.

**Why:** Preserves the dev-vs-prod swap that makes local development possible without Supabase. `FileBackend` implementations can be naive (one JSON file per CSP report); the point is type safety and test parity.

### Pattern 2: External IO in `lib/`, not in `app/actions.ts`

**What:** Safe Browsing HTTP calls live in `lib/safeBrowsing.ts`. The action calls one function, gets a verdict back.

**Why:** Keeps `app/actions.ts` readable and lets a future cron / admin re-scan call the same function. Matches existing pattern where `lib/shares.ts` owns bcrypt and nanoid while actions just orchestrate.

### Pattern 3: Translate at presentation, not at the action

**What:** Server Actions return `errorCode` strings. Components map codes to translated strings via `useTranslations('errors')`.

**Why:** Keeps `lib/` and `app/actions.ts` locale-agnostic. Makes testing simpler (assert on code, not string). Aligns with how form libraries (react-hook-form, conform) expect errors.

### Pattern 4: Cookie-based locale preserves share URLs

**What:** `localePrefix: 'never'` — `/s/<id>` is the canonical URL forever, regardless of viewer language.

**Why:** PROJECT.md explicitly chose this in Key Decisions. Architecturally, it means: (a) no locale segment in routing config; (b) cookie + Accept-Language is the only locale signal; (c) `<link rel="alternate" hreflang>` is unnecessary (noindex app).

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Putting Safe Browsing in middleware/`proxy.ts`

**What goes wrong:** Tempting because middleware "intercepts" requests. But share creation is a POST to a Server Action — middleware would have to parse a form body before the action runs.

**Why bad:** Doubles parsing cost, fights the framework, breaks if the body is multipart, runs on viewer GETs that have nothing to scan.

**Instead:** Call `scanUrls()` from inside `createShareAction` after rate-limit check. Action layer is the right semantic home.

### Anti-Pattern 2: One global CSP for both wrapper and raw content

**What goes wrong:** Trying to express both the app shell's CSP and the user-HTML CSP in `next.config.ts headers()`. Existing `app/s/[id]/raw/route.ts:46` already builds a per-response CSP for content; conflating them loses the strictness of `connect-src 'none'` for content.

**Why bad:** Either wrapper breaks (can't load its own JS) or content escapes its tight box (exfil channel reopens).

**Instead:** Two CSPs, two homes. `next.config.ts` for wrapper (loose enough for the app to function). `raw/route.ts` keeps its strict per-response CSP exactly as is. Both report to `/api/csp-report` with distinct `ctx` query params.

### Anti-Pattern 3: Putting legal page content in Supabase

**What goes wrong:** Editing ToS from the admin UI seems convenient. But: (a) legal copy is versioned with code review, not admin clicks; (b) introduces XSS vector if ever rendered without sanitization; (c) cold-start hits DB for static text on every visit.

**Instead:** Bundle markdown in `content/legal/`. Edits go through PRs.

### Anti-Pattern 4: Mixing `proxy.ts` matcher with `/api/*`

**What goes wrong:** next-intl middleware's default matcher catches everything; if not excluded, it tries to rewrite `/api/csp-report` and breaks the JSON POST.

**Instead:** `matcher: ['/((?!api|_next|.*\\..*).*)']` — exclude API routes, internal Next assets, and files with extensions (favicon, etc.).

---

## Scalability Considerations

| Concern | Now (low traffic) | At 10k creates/day | At 100k creates/day |
|---------|-------------------|--------------------|--------------------|
| Safe Browsing API quota | 10k clients/day default — fine | Need quota request from Google; aggressive URL caching mandatory | Consider Update API (local hash list) over Lookup; or move to v5 if migrated |
| CSP report volume | Trivial | Rate-limit per IP + dedupe identical violations | Pipe to dedicated log sink (e.g., Sentry CSP endpoint); database table becomes summary table |
| Message bundle size | en + zh-Hant ≈ 20KB | Same | Same — bundle splits per route via next-intl |
| Legal page rendering | fs.readFile per request | Wrap in React `cache()` for request-dedup; or read at module init | Pre-render at build (Server Component is static if no dynamic params) |
| Security status checks | Synchronous on admin page load | Add explicit refresh button; cache 5min | Background cron updates a `security_status` row; admin reads it |

---

## Sources

- [Next.js docs — next.config.js headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers) (HIGH — official, current)
- [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router) (HIGH — official)
- [next-intl Routing configuration (`localePrefix: 'never'`)](https://next-intl.dev/docs/routing/configuration) (HIGH — official)
- [next-intl Proxy / middleware](https://next-intl.dev/docs/routing/middleware) (HIGH — official; confirms Next 16 `proxy.ts` rename)
- [Google Safe Browsing v4 Lookup API](https://developers.google.com/safe-browsing/v4/lookup-api) (HIGH — official; 500 URLs/POST)
- [Google Safe Browsing v4 Caching](https://developers.google.com/safe-browsing/v4/caching) (HIGH — official; cacheDuration semantics)
- [Google Safe Browsing v4 Usage Limits](https://developers.google.com/safe-browsing/v4/usage-limits) (HIGH — official; 10k clients/day default. NOTE: v4 is deprecated per Google's notice; migration path to v5 should be evaluated before commit)
- [MDN — Content-Security-Policy: report-to](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-to) (HIGH — MDN)
- [MDN — CSPViolationReport](https://developer.mozilla.org/en-US/docs/Web/API/CSPViolationReport) (HIGH — MDN; report shape)
- [Sentry — Security Policy Reporting for Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/security-policy-reporting/) (MEDIUM — vendor doc, but confirms route handler pattern)

**Confidence summary:**
- HIGH: next.config headers, next-intl provider/routing/cookie strategy, CSP report shape, Safe Browsing API mechanics
- MEDIUM: Specific placement of SEC-01 inside Server Action (verified pattern from action-layer responsibilities; no canonical reference for "best place for external safety APIs in Next.js")
- LOW (flag for phase research): Safe Browsing v4 deprecation timeline — confirm v4 still works for v2 launch window or pivot to v5 before SEC-01 phase begins
