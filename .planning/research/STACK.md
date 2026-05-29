# Technology Stack — v2 Additions (Security Hardening + i18n)

**Project:** html2u v2
**Researched:** 2026-05-29
**Scope:** Additions for SEC-01..05 and I18N-01..05. The v1 stack
(Next.js 16.2.6 App Router + React 19 + TypeScript + Supabase +
Auth.js v5 + Vercel) is **locked** and not re-litigated here.

---

## Recommended Stack (new dependencies)

| Capability | Pick | Version (May 2026) | Confidence |
|------------|------|--------------------|------------|
| Safe Browsing URL scan (SEC-01) | Raw `fetch` against v4 Lookup API (`threatMatches:find`) — no SDK | API v4 (HTTP); migrate to v5 before 2027-03-31 | HIGH |
| Security HTTP headers (SEC-02) | `next.config.ts` `headers()` async function | Native (Next.js 16.2.6) | HIGH |
| CSP violation reporting (SEC-03) | `Reporting-Endpoints` header + `report-to` CSP directive + `POST /api/csp-report` route handler; parse `application/reports+json` and `application/csp-report` (legacy) | Reporting API v1 (Baseline 2024) | HIGH |
| Report payload validation (SEC-03) | `zod` (already an unstated peer of Auth.js v5; pin explicitly) | `zod` ^3.23.x | MEDIUM |
| Legal copy rendering (SEC-04) | Plain MDX-free Server Components in `app/(legal)/{tos,privacy,dmca}/page.tsx`, content sourced from `messages/{locale}.json` keys | Native | HIGH |
| Admin Security Status (SEC-05) | Plain Server Component panel + a `GET /api/admin/security-status` aggregator (cached 60s) reading: env presence, `csp_reports` count from Supabase, last Safe Browsing API ping | Native (no new lib) | HIGH |
| i18n core (I18N-01..05) | **`next-intl`** (cookie-based, `localePrefix: 'never'`) | `next-intl` ^4.13.x | HIGH |
| Accept-Language parsing (I18N-01) | `@formatjs/intl-localematcher` + `negotiator` (next-intl's documented combo) | `@formatjs/intl-localematcher` ^0.5.x, `negotiator` ^1.0.x | HIGH |

---

## Detailed picks and rationale

### SEC-01 — Google Safe Browsing v4 Lookup API

**Pick: raw `fetch` from a Node-runtime route handler.** Do NOT install
`@googleapis/safebrowsing`.

**Endpoint:**

```
POST https://safebrowsing.googleapis.com/v4/threatMatches:find?key=$SAFE_BROWSING_API_KEY
Content-Type: application/json
```

Request body (one request can carry up to 500 URLs):

```json
{
  "client": { "clientId": "html2u", "clientVersion": "2.0.0" },
  "threatInfo": {
    "threatTypes":      ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
    "platformTypes":    ["ANY_PLATFORM"],
    "threatEntryTypes": ["URL"],
    "threatEntries":    [{ "url": "https://example.com/phish" }]
  }
}
```

Response: `{}` when clean, or `{ matches: [...] }` with the threat
type/platform/cache duration when hit.

**Why raw fetch, not a library:**

- `@googleapis/safebrowsing` (14.1.0) pulls in the entire `googleapis-common`
  + `gaxios` + `google-auth-library` stack — ~3 MB of transitive deps for one
  POST that takes a 1‑line JSON body. On Vercel that is dead weight in every
  Lambda cold start.
- The Lookup API authenticates with a plain API key in the query string. No
  OAuth, no token refresh — the only thing an SDK buys you here is JSON
  marshalling that `fetch` + TypeScript types do for free.
- Third-party wrappers (`safe-browse-url-lookup`, `gsb-node`) are abandoned
  hobby projects — not safe to take on as a security-path dependency.

**Why v4 (not v5) for now:**

- v4 Lookup API is the **most widely documented**, has a stable wire format,
  and is what every other public service still ships against.
- Google has announced v4 sunset **2027-03-31** ([source](https://www.synoforum.com/threads/google-safe-browsing-api-v4-to-v5.15868/)).
  That gives v2 a comfortable migration window; SEC-01 can ship on v4 and
  a follow-up ticket can swap to v5 ahead of sunset.
- v4 is for **non-commercial use only**; html2u is currently a free public
  service, which qualifies. If/when html2u monetizes, switch to Web Risk API
  (commercial, paid). See [Usage Restrictions](https://developers.google.com/safe-browsing/v4/usage-limits).
- v5 (Lookup API) lives at `safebrowsing.googleapis.com/v5/hashes:search`
  with a hash-prefix protocol — worth porting once but not the right
  battle for the v2 milestone.

**Cost & quota:**

- **Free.** All Safe Browsing API use is no-charge ([pricing](https://developers.google.com/safe-browsing/v4/pricing)).
- Default per-project quota is generous (the docs reference "up to 10,000
  clients per 24h per key") and is increasable via Google Cloud Console
  on request.

**Operational notes:**

- New env var: `SAFE_BROWSING_API_KEY` (server-only; required in production,
  optional in dev — when absent, log a warning and skip the check).
- Route handler must run on the Node runtime (`export const runtime = 'nodejs'`)
  so `fetch` has Node TLS and timeouts behave predictably; the Edge runtime
  is fine too but `nodejs` keeps it consistent with the existing
  `lib/backend.ts` Supabase code path.
- Batch all URLs extracted from one share into a **single** POST (limit 500).
  Round-trip latency is ~80–250 ms from us-east-1 → `safebrowsing.googleapis.com`;
  one batched call is dramatically cheaper than per-URL calls.
- Failure mode: if Safe Browsing returns 5xx or times out (use a 3s
  `AbortSignal.timeout(3000)`), **fail open** (allow the share) and log a
  warning. SEC-01 is one layer in defense-in-depth, not the only one.
- URL extraction: use a regex over the raw HTML, then normalize with
  `new URL()`; this is intentionally permissive (catches `href`, `src`,
  inline JS `window.location = '...'`). No need for a full HTML parser.

**Confidence: HIGH** — official Google REST docs verified; sunset date
cross-referenced; library bloat verified via npm.

---

### SEC-02 — Security HTTP headers

**Pick: `next.config.ts` `async headers()` function.** Do NOT use middleware
(now `proxy.ts` in Next.js 16) for these.

```ts
// next.config.ts
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      { key: 'X-Frame-Options', value: 'DENY' }, // overridden on /s/[id] which needs framing
    ],
  }, {
    // /s/[id] is itself an iframe wrapper — allow same-origin framing
    source: '/s/:path*',
    headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
  }];
}
```

**Why `next.config.ts` not `proxy.ts`:**

- In **Next.js 16, `middleware.ts` was renamed to `proxy.ts`** to clarify
  that it is for routing/rewrites/redirects, not for security. The official
  guidance ([Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy))
  explicitly says: **"Middleware is not a security boundary."** Putting
  security headers in a layer the Next.js team is actively de-emphasizing
  is wrong direction.
- `next.config.ts` `headers()` is applied at the framework's response layer
  and works on **every** route (static, dynamic, API, error) without an
  Edge function invocation. That is faster, cheaper, and survives any
  future middleware/proxy refactor.
- Per-route CSP (e.g. the strict CSP on `/s/[id]/raw` we already ship) stays
  exactly where it is — set via `headers` on the `Response` in the route
  handler. We do NOT consolidate CSP into `next.config.ts` because the raw
  content route's CSP is dynamic (`frame-ancestors $APP_ORIGIN`).

**Notes:**

- `X-Frame-Options` is largely superseded by CSP `frame-ancestors`, but it
  is still useful for legacy clients and admin tooling that scans for it.
- `Permissions-Policy: interest-cohort=()` is the FLoC opt-out — costs
  nothing, signals intent.
- No `Cross-Origin-*` headers (COOP/COEP/CORP) by default: enabling them
  globally would break the iframe wrapper and the `/s/[id]/raw` cross-origin
  fetch via signed URL. Keep them off until they are ever actually needed.

**Confidence: HIGH** — Next.js 16 docs verified for both `headers()` and
the proxy rename.

---

### SEC-03 — CSP violation reporting

**Pick: Modern Reporting API v1 (`Reporting-Endpoints` + `report-to`),
with `report-uri` retained as a legacy fallback. Ingest at `POST /api/csp-report`.**

**Wire format (set in `next.config.ts` `headers()` for the wrapper routes,
and on the `Response` for `/s/[id]/raw`):**

```
Reporting-Endpoints: csp-endpoint="https://html2u.vercel.app/api/csp-report"
Content-Security-Policy: <existing policy>;
  report-to csp-endpoint;
  report-uri /api/csp-report
```

**Why both directives:**

- `report-to` (Reporting API v1) is the modern, structured spec.
  [Baseline-2024](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Reporting-Endpoints):
  cross-browser support landed September 2024, and per MDN
  ([CSP report-to](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-to))
  "report-to feature works across the latest devices and browser versions
  since March 2026."
- `report-uri` is **deprecated in CSP Level 3** but still widely
  implemented. Browsers that support `report-to` ignore `report-uri`,
  so shipping both is safe and gives us coverage on older clients (notably
  Safari < 17 and any in-the-wild Android WebViews).
- `Report-To` header (capital R, pre-2024 spec) is **superseded by
  `Reporting-Endpoints`**. Do NOT ship `Report-To`; use only `Reporting-Endpoints`.

**Payload shapes the ingestion route must handle:**

1. Modern (`Content-Type: application/reports+json`) — an **array** of
   reports, each like:

   ```json
   {
     "age": 53531,
     "type": "csp-violation",
     "url": "https://html2u.vercel.app/s/abc",
     "user_agent": "Mozilla/5.0 ...",
     "body": {
       "blockedURL": "inline",
       "disposition": "enforce",
       "documentURL": "https://html2u.vercel.app/s/abc",
       "effectiveDirective": "script-src-elem",
       "originalPolicy": "default-src 'none'; ...; report-to csp-endpoint",
       "referrer": "",
       "sample": "console.log(\"x\")",
       "sourceFile": "https://html2u.vercel.app/s/abc",
       "statusCode": 200,
       "lineNumber": 1,
       "columnNumber": 1
     }
   }
   ```

2. Legacy (`Content-Type: application/csp-report`) — a **single** object
   wrapped in `{ "csp-report": { ... } }` with snake-case-ish fields
   (`blocked-uri`, `effective-directive`, `document-uri`, etc.).

The route handler should:

- Accept POST only; reject non-POST with 405.
- Parse both content types; normalize into a single internal shape.
- Validate with `zod` (strip unknown fields, cap string lengths so a
  malicious reporter can't blow up storage).
- Apply per-IP rate limiting via the existing `incr_rate` Supabase
  procedure (suggest 60/min — CSP reports can be bursty on first paint).
- Insert into a new `csp_reports` table (`id`, `created_at`, `share_id`
  nullable, `directive`, `blocked_uri`, `document_uri`, `sample`,
  `user_agent`, `ip` — match `shares.ip_hash` convention).
- Return 204 No Content.

**Operational notes:**

- Reports do NOT carry credentials; do not call `auth()` in this route.
- The browser fires reports out-of-band — keep the route handler fast and
  never block on Supabase write failures (best-effort log + 204).

**Confidence: HIGH** — MDN explicitly current to 2026; payload shape
cross-verified with three sources.

---

### SEC-04 — Legal pages (`/tos`, `/privacy`, `/dmca`)

**Pick: Plain Server Component pages, content stored as strings in
`messages/{locale}.json` under a `legal.*` namespace.**

- No CMS, no MDX runtime. The copy is short, edits are infrequent, and
  the i18n machinery already gives us per-locale string lookup.
- Each page is a Server Component that calls `getTranslations('legal.tos')`
  (next-intl API) and renders `<article>` with a small set of Tailwind/CSS
  utility classes for headings.
- Wire `/tos`, `/privacy`, `/dmca` into the existing footer.
- For DMCA contact, use a `mailto:` link to `ADMIN_EMAILS[0]` — no form
  endpoint needed in v2.

**Confidence: HIGH** — standard pattern, no novel tech.

---

### SEC-05 — Admin "Security Status" panel

**Pick: Single Server Component at `/admin/security` that fetches an
aggregator endpoint.** No new third-party dependencies.

Indicators:

| Indicator | Source | "Healthy" definition |
|-----------|--------|----------------------|
| Safe Browsing API key present | `process.env.SAFE_BROWSING_API_KEY` | non-empty |
| Safe Browsing API reachable | live ping with a known-malicious test URL (e.g. `http://malware.testing.google.test/testing/malware/`) | returns a match |
| Headers present | `fetch('/', { method: 'HEAD' })` and inspect | HSTS + nosniff + referrer + permissions all set |
| CSP reports (7d) | `SELECT count(*) FROM csp_reports WHERE created_at > now()-interval '7 days'` | reported, not alerted |
| Last admin sign-in | existing Auth.js session table or a new column | within 30d |

The "weekly review checklist" is a static Markdown block on the same page —
sample malicious URLs (using Google's published test URLs), step-by-step
clicks. No automation in v2.

**Confidence: HIGH.**

---

### I18N-01..05 — `next-intl` with cookie-based locale

**Pick: `next-intl` ^4.13.x with `localePrefix: 'never'`.**

**Why next-intl (vs alternatives):**

| Candidate | Verdict | Why |
|-----------|---------|-----|
| **next-intl** | **Chosen** | Purpose-built for App Router + Server Components; ~2 KB; cookie-mode officially supported via `localePrefix: 'never'`; actively maintained (4.13.x on npm, May 2026); first-class TypeScript types for message keys |
| next-i18next | Rejected | Pages-Router heritage; Server Component story is bolted on; pulls in full `i18next` runtime (~20 KB); features we don't need (saveMissing, backend plugins) — useful for teams using Locize, irrelevant here |
| Next.js native `i18n` config | Rejected | Pages Router only — **does not work in App Router at all**. Docs explicitly say so. ([source](https://nextjs.org/docs/pages/guides/internationalization)) |
| `next-i18n-router` | Rejected | Solves a problem we don't have (URL-prefix routing); we explicitly chose cookie mode |

**How the five requirements map onto next-intl:**

- **I18N-01 (Accept-Language detection, server-side, fallback zh-Hant):**
  In `i18n/request.ts`, read the `locale` cookie first; if absent, parse
  `headers().get('accept-language')` with `@formatjs/intl-localematcher`
  + `negotiator` (this is the documented next-intl recipe — both libs are
  tiny and stable). Fallback `'zh-Hant'`.
- **I18N-02 (language switcher with cookie persistence):** A small Client
  Component that calls a Server Action to set the `locale` cookie
  (`httpOnly: false`, `sameSite: 'lax'`, `maxAge: 60*60*24*365`), then
  `router.refresh()`. Cookie name: `NEXT_LOCALE` (the convention next-intl
  recognizes by default).
- **I18N-03 (full coverage zh-Hant + en):** Author `messages/zh-Hant.json`
  and `messages/en.json`. Use `useTranslations()` in Client Components,
  `getTranslations()` in Server Components. Type-safe keys via the
  `IntlMessages` global next-intl declares.
- **I18N-04 (locale-aware metadata + `<html lang>`):** `generateMetadata()`
  in `app/layout.tsx` returns a `title`/`description` from
  `getTranslations('meta')`; `<html lang={await getLocale()}>`.
- **I18N-05 (drop-in zh-Hans / ja / ko):** Add files to `messages/`,
  add the code to a `locales` array constant; no other code changes.

**Setup file map (additions only):**

```
i18n/request.ts          ← next-intl request config (locale resolution)
messages/zh-Hant.json    ← canonical strings
messages/en.json
app/[no-folder-rename-needed]  ← localePrefix:'never' means no [locale] segment in routes
components/LocaleSwitcher.tsx
app/actions/locale.ts    ← Server Action to set cookie
```

Note: with `localePrefix: 'never'`, next-intl docs still recommend a
`[locale]` folder to expose the param. For html2u, since we are NOT
prefixing URLs, we can use the simpler "no routing" mode where
`i18n/request.ts` returns the locale directly without a `[locale]`
segment — this is the cleanest fit and preserves all existing `/s/<id>`,
`/m/<id>/<token>`, and `/admin` URLs unchanged.

**Cost:** Zero. All client-side; no external service.

**Confidence: HIGH** — next-intl 4.x release verified on npm (4.13.0,
May 2026); cookie-mode pattern verified on the official next-intl docs.

---

## Alternatives considered and rejected

| Category | Chosen | Rejected | Why rejected |
|----------|--------|----------|--------------|
| Safe Browsing client | raw `fetch` | `@googleapis/safebrowsing` 14.1.0 | 3 MB of transitive deps for a 1-call API |
| Safe Browsing client | raw `fetch` | `safe-browse-url-lookup`, `gsb-node` | unmaintained hobby wrappers |
| Safe Browsing API | v4 Lookup | v5 Hash-Search | v4 is stable through 2027-03-31; v5 hash protocol is more complex; defer |
| Safe Browsing API | v4 Lookup | Web Risk API | Web Risk is paid; html2u is non-commercial |
| Security headers | `next.config.ts` `headers()` | `proxy.ts` (formerly middleware) | Next.js 16 explicitly de-emphasized middleware as a security layer |
| CSP reporting | `Reporting-Endpoints` + `report-to` | `Report-To` (old spec) | superseded; MDN says use `Reporting-Endpoints` |
| CSP reporting | both `report-to` + `report-uri` | `report-to` only | older clients (pre-2024 Safari, WebViews) still need `report-uri` |
| Legal copy | static strings in JSON | MDX runtime, Contentlayer | overkill for ~3 short pages |
| i18n library | next-intl 4.13 | next-i18next | Pages-Router DNA; heavier; we don't need i18next ecosystem |
| i18n library | next-intl 4.13 | Next.js native `i18n` | App Router incompatible |
| i18n routing | `localePrefix: 'never'` (cookie) | URL prefix (`/en`, `/zh-Hant`) | app is `noindex`; URLs must stay stable for sharing |
| Accept-Language parse | `@formatjs/intl-localematcher` + `negotiator` | DIY split-and-match | spec-compliant matching with quality values is error-prone to roll by hand |

---

## Installation

```bash
# Runtime deps
npm install next-intl@^4.13 @formatjs/intl-localematcher@^0.5 negotiator@^1.0 zod@^3.23

# Dev types for negotiator
npm install -D @types/negotiator
```

No new dev tooling. No build-time codegen. No new infra.

---

## New environment variables

| Var | Required | Scope | Purpose |
|-----|----------|-------|---------|
| `SAFE_BROWSING_API_KEY` | production only | server | Google Safe Browsing v4 Lookup API key. Create at console.cloud.google.com, enable the "Safe Browsing API", restrict to server IPs not feasible on Vercel — use API restriction by API name instead. |
| (no new vars for headers, CSP, or i18n) | — | — | — |

Update `.env.example` accordingly.

---

## Operational checklist (handoff to roadmap)

- [ ] Provision `SAFE_BROWSING_API_KEY` in Vercel project env (production
      + preview).
- [ ] Add `csp_reports` table to `supabase/schema.sql` (migration must
      be backward-compatible per project constraint).
- [ ] Verify CSP reports actually arrive in dev by intentionally
      violating the policy (e.g. inline `<script>` in a test share with
      the strict CSP).
- [ ] Add `LOCALE` cookie to the existing Auth.js `cookies` allow-list
      (if any explicit allow-list exists in `auth.ts`).
- [ ] After ship, set a 2027-Q1 reminder to migrate SEC-01 from v4 → v5.

---

## Sources

### Safe Browsing
- [Safe Browsing v4 Overview](https://developers.google.com/safe-browsing/v4) — official, confirms v4 deprecation status
- [Safe Browsing v4 Lookup API](https://developers.google.com/safe-browsing/v4/lookup-api) — request/response shape, 500-URL batch limit
- [Safe Browsing v4 Pricing](https://developers.google.com/safe-browsing/v4/pricing) — confirms "free of charge"
- [Safe Browsing v4 Usage Restrictions](https://developers.google.com/safe-browsing/v4/usage-limits) — non-commercial only
- [@googleapis/safebrowsing on npm](https://www.npmjs.com/package/@googleapis/safebrowsing) — version verification (14.1.0)
- [Safe Browsing v4 → v5 migration discussion](https://www.synoforum.com/threads/google-safe-browsing-api-v4-to-v5.15868/) — 2027-03-31 sunset date

### Next.js 16 headers + proxy
- [Next.js — Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy) — official rename rationale
- [Next.js — `next.config.js` headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers) — `headers()` API
- [Next.js — proxy.js file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — confirms scope is routing only
- [Next.js 16 XSS Hardening Cheat Sheet (2026)](https://techbytes.app/posts/nextjs-16-xss-hardening-2026-security-cheat-sheet/) — community validation

### CSP Reporting API
- [MDN — Reporting-Endpoints header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Reporting-Endpoints) — Baseline 2024
- [MDN — CSP report-to directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-to) — March 2026 cross-browser
- [MDN — CSP report-uri directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-uri) — deprecation note
- [Collecting CSP Reports — Flowlet](https://flowlet.app/blog/collecting-csp-reports) — payload shape confirmation

### i18n
- [next-intl on npm](https://www.npmjs.com/package/next-intl) — version (4.13.0)
- [next-intl App Router setup](https://next-intl.dev/docs/getting-started/app-router) — official setup
- [next-intl Routing configuration (`localePrefix: 'never'`)](https://next-intl.dev/docs/routing/configuration) — cookie-mode spec
- [next-intl 4.0 release notes](https://next-intl.dev/blog/next-intl-4-0) — v4 changes
- [Next.js i18n guide (Pages Router only)](https://nextjs.org/docs/pages/guides/internationalization) — confirms native i18n is Pages-Router only

---

*Stack additions research: 2026-05-29*
