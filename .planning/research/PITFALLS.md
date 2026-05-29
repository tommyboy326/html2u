# Domain Pitfalls — html2u v2 (Security Hardening + i18n)

**Project:** html2u (public anonymous HTML sharing on Next.js 16 App Router + Supabase + Vercel)
**Researched:** 2026-05-29
**Scope:** SEC-01..05 (Safe Browsing, headers, CSP reports, legal pages, admin status) + I18N-01..05 (Accept-Language detection, switcher, zh-Hant + en)
**Overall confidence:** MEDIUM-HIGH (most claims verified against MDN, official Google/Vercel docs, and credible community reports)

---

## Critical Pitfalls

Mistakes that cause user-facing breakage, silent security failures, or rewrites.

### CRIT-1: Safe Browsing "fail open" silently marks every share safe when quota or network fails

**What goes wrong:** SEC-01 calls Google Safe Browsing v4 Lookup. On HTTP 429 (quota exhausted), 5xx (Google outage), DNS failure, or timeout, the naïve `try/catch` returns `[]` (no matches) — which the create path interprets as "no phishing found, allow." From that moment on, every uploaded share bypasses scanning, and the only visible symptom is a single `console.error` in Vercel logs that nobody is paid to watch.

**Why it happens specific to v2:** The default `fetch()` has no timeout in Node, no retry, and the failure path naturally returns "negative" because that's the same shape as a clean response (`{matches: []}` ≈ undefined `matches`). Quota for a fresh project is 10k requests/day per API key — easily blown by a burst from a scanner crawling the site. (Source: [Google Safe Browsing v4 usage limits](https://developers.google.com/safe-browsing/v4/usage-limits), [community report — 100s rate limit](https://github.com/afilipovich/gglsbl/issues/22).)

**Consequences:** Phishing pages get hosted on `html2u.vercel.app`, Google demotes the domain reputation, eventually Vercel's `.vercel.app` parent gets a Safe Browsing interstitial that affects every other deployment on the platform — and the operator finds out from a user email, not from monitoring.

**Warning signs:**
- `safe_browsing_check` rows in DB show all `verdict='clean'` for >24h with no `'flagged'` ever
- Vercel function logs spike with `429` or `fetch failed` from `safebrowsing.googleapis.com`
- Daily share count rises but the admin "Security Status" panel shows "Safe Browsing: 0 flagged this week"

**Prevention:**
1. **Fail closed, not open.** On any non-200 from Safe Browsing, set verdict to `'unknown'`, NOT `'clean'`. Treat `'unknown'` as: allow create but tag the share for admin review (visible in SEC-05 panel), do not present as "scanned & safe" in any UI copy.
2. **Hard timeout (3–5s) with `AbortController`**, then circuit-break: if N consecutive failures within M minutes, switch to a degraded mode that queues URLs for retry instead of synchronously calling.
3. **Persist the API verdict per URL** (not per share) so retries are cheap and quota goes further.
4. **Monitor the verdict distribution** in SEC-05, not just "API reachable." A panel that shows "100% clean" should look suspicious, not reassuring.
5. **Dedupe URLs before lookup.** Lookup API accepts batches of up to 500; one call per share, not one call per URL.

**Addressed by:** SEC-01 (must include fail-closed semantics in implementation), SEC-05 (verdict-distribution chart, not just up/down)

---

### CRIT-2: Safe Browsing only sees the URLs you extract — redirects, late-bound links, and text-only social engineering escape entirely

**What goes wrong:** SEC-01 extracts URLs from the static HTML at upload time. But (a) HTML can build URLs at runtime via JS (`location='https://'+phish+'.com'`), (b) shorteners and intermediate hops aren't followed, and (c) "Send your password to support@…" or a phone number with no URL at all carries no URL to scan. The scanner reports "0 matches," the share is published, and the abuse happens anyway. Attackers actively rotate URLs and chain conditional redirects faster than scanners can follow. (Source: [Penligent — bypass link redirect-chain evasion](https://www.penligent.ai/hackinglabs/bypass-link-explained-how-attackers-evade-protections-and-how-defenders-secure-urls/).)

**Why it happens specific to v2:** html2u serves arbitrary user JS inside the iframe (charts, animations — explicit feature). The strict CSP blocks exfil but NOT in-iframe behaviour like building a `<a href>` from string concatenation at click time. SEC-01's URL extraction (regex over static HTML, or even a DOM walk over the source) cannot see those.

**Consequences:** Safe Browsing's presence creates a false sense of security in the admin and in legal copy ("we scan every share against Google Safe Browsing"). The first phishing incident reveals the gap and forces a retreat from marketing claims.

**Warning signs:**
- Abuse reports (SAFE-08) for shares that scanned "clean"
- Shares where extracted-URL count is 0 but the HTML is >5KB (text-only social-engineering bait)

**Prevention:**
1. **Frame SEC-01 honestly:** internally and in legal copy, call it "known-phishing-URL filter," not "phishing detection." It catches the lazy attacker, not the targeted one.
2. **Combine with existing controls** (SAFE-03 warm-amber banner, SAFE-06 rate limits, SAFE-08 report endpoint, sandboxed iframe). The banner is still the strongest control per PROJECT.md and must NOT be relaxed because "we now scan."
3. **For known shorteners** (`bit.ly`, `t.co`, `lihi.cc`, etc.), reject at upload OR resolve server-side before scanning. Maintain a small allowlist of shorteners-to-resolve.
4. **Heuristic flagging** alongside Safe Browsing: presence of password/credit-card form keywords with a non-html2u domain, brand impersonation strings ("Apple ID", "中華電信", "玉山銀行"), etc. Flag for review, do not auto-block.

**Addressed by:** SEC-01 implementation (extraction strategy + shortener handling), SEC-04 (truthful legal copy), SEC-05 (review queue, not just status)

---

### CRIT-3: HSTS `preload` + `includeSubDomains` on `.vercel.app` is a footgun you can't undo

**What goes wrong:** SEC-02 adds `Strict-Transport-Security`. The "complete" template from any cheat sheet includes `max-age=31536000; includeSubDomains; preload`. But on the `html2u.vercel.app` subdomain, you do not control `vercel.app` and cannot submit it for preload — and `includeSubDomains` applied at a subdomain level affects sibling Vercel deployments visiting from the same browser. Worse: once submitted to the preload list, removal takes months. (Sources: [OWASP HSTS cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html), [Vercel HSTS docs](https://vercel.com/docs/cdn-security/encryption) — note `.vercel.app` is already preloaded by Vercel.)

**Why it happens specific to v2:** html2u currently runs on `html2u.vercel.app`. PROJECT.md "Out of Scope" defers a custom `CONTENT_ORIGIN` domain. So the HSTS headers you ship in v2 will go out from a subdomain that already inherits Vercel's HSTS — and any `includeSubDomains` you set is redundant at best, confusing at worst.

**Consequences:** If v3 introduces a custom domain with one HTTP-only subdomain (e.g., a redirect host), `includeSubDomains` will lock users out of it. If a developer adds `preload` to please a scanner and a future domain change is needed, undoing it requires months.

**Warning signs:**
- HSTS scanners (Mozilla Observatory, securityheaders.com) gave the project an A+ — and the operator now feels obligated to keep `preload` to maintain the score
- A user reports "can't reach `legacy.html2u.example`" after a custom domain migration

**Prevention:**
1. **On `.vercel.app`: do not set HSTS yourself.** Vercel already does it correctly. Setting it again is at best no-op, at worst inconsistent.
2. **On a future custom domain: ship `max-age=86400` (1 day) first**, NOT a year. Increase only after a week of confirming no mixed-content or HTTP-redirect breakage.
3. **Do NOT add `preload`** in v2. Only after a custom domain has been on a year-long max-age + includeSubDomains without incident, AND the operator has explicitly accepted the long-term commitment.
4. **Never add `includeSubDomains`** if any sibling subdomain might serve HTTP (admin dashboards, legacy redirects, internal tools).

**Addressed by:** SEC-02 (explicit HSTS policy decision in implementation, written in CONCERNS/decision log)

---

### CRIT-4: CSP report endpoint becomes a DoS amplifier when it lands on `/api/csp-report`

**What goes wrong:** SEC-03 ships `report-uri /api/csp-report` (or modern `report-to`). Two things flood it: (a) every Chrome extension that injects fonts/scripts triggers reports — LINER and LetyShops alone have been measured generating hundreds of bogus reports per page load (Source: [DebugBear — CSP extension noise](https://www.debugbear.com/blog/chrome-extension-csp-error-noise)), and (b) attackers can directly POST forged reports to flood logs/DB (Source: [websec/CSPAM tool](https://github.com/websec/CSPAM)). If the endpoint blindly inserts every report into Supabase, the `shares` DB's storage tier blows out, and the same admin dashboard that should show signal becomes unreadable.

**Why it happens specific to v2:** html2u is `noindex` but linkable. Browsers without extension protection (most users) will fire ext-induced reports against the *content CSP* — and SEC-02 considers tightening the *main app* CSP too, multiplying the report sources. The Supabase free tier has 500 MB total (CONCERNS.md scaling limit on `shares`); a single bored attacker can fill that with 1 KB POSTs overnight.

**Consequences:**
- DB fills, `shares` insert starts failing (cascading into CORE-01 outage)
- Admin "CSP violations last 7d" widget shows 47,000 → operator gives up looking
- Real violations (which are the point of CSP-3) get lost in noise

**Warning signs:**
- `csp_reports` row count growing by >10x per day after launch
- A handful of `blocked-uri` values dominate >90% of reports (extension signatures)
- Single `source-ip` accounts for >50% of reports in any hour

**Prevention:**
1. **Rate limit `/api/csp-report` per IP** before DB write — reuse SAFE-06 infrastructure (`incrRate`). 60/min/IP is generous; anything above is an attacker or buggy extension.
2. **Cap report body size** at ~8 KB; reject larger. Browsers send small JSON; attackers send big.
3. **Reject on `Content-Type` mismatch** (`application/csp-report` or `application/reports+json`).
4. **Dedupe in storage:** key on `(document-uri, blocked-uri, violated-directive, source-file, line-number)`, increment a `count` column instead of inserting rows. One row per unique violation, not one per occurrence.
5. **Hash the policy into the report URI** (e.g., `/api/csp-report?p=<hash>`) and reject reports whose echoed `original-policy` doesn't match — kills almost all forged reports. (Source: [Dropbox — On CSP reporting and filtering](https://dropbox.tech/security/on-csp-reporting-and-filtering).)
6. **Extension allowlist for `blocked-uri` prefixes**: drop reports where `blocked-uri` starts with `chrome-extension:`, `moz-extension:`, `safari-web-extension:` BEFORE storage.
7. **TTL the table:** auto-delete reports older than 30 days. Use the same pg_cron pattern called out in CONCERNS.md (which is currently commented out — enable it for `rate_limits` AND `csp_reports`).

**Addressed by:** SEC-03 implementation must include all of (1)–(7); SEC-05 dashboard must show deduped/aggregated, not raw, counts

---

### CRIT-5: i18n hydration mismatch from server-side Accept-Language vs client cookie

**What goes wrong:** I18N-01 detects locale server-side from `Accept-Language`. I18N-02 persists user choice in a cookie. Race: server sees no cookie yet, reads `Accept-Language: en-US`, renders EN. The cookie was set by a previous-tab visit to `zh-Hant`; the browser sends it on the same request — but the server reads `Accept-Language` first and ignores the cookie. Or vice versa: the server uses the cookie, but the React client component re-derives locale from `navigator.language` for the switcher highlight, picking a different one. React 19 + Next 16 surfaces this as a hard hydration error in production, blanking the page. (Sources: [Next.js hydration errors guide](https://nextjs.org/docs/messages/react-hydration-error), [next-intl routing config](https://next-intl.dev/docs/routing/configuration).)

**Why it happens specific to v2:** PROJECT.md says cookie-based switching, NOT URL prefix. That means *every* request must resolve locale on the server before render — and any client component that touches `navigator.language` or `Intl.DateTimeFormat(undefined, …)` for "current locale" will diverge. Date/number formatting (timestamps in admin, expiry countdowns) is the most common offender.

**Consequences:**
- Production page randomly blanks for users with a previous-session cookie + non-default browser language
- React error overlay in dev, silent hydration mismatch + client-side re-render in prod (slow + visibly flickers)
- The safety banner (SAFE-03 — the most important UI element) is the highest-risk surface because it's rendered on EVERY share view

**Warning signs:**
- Console hydration warnings on share view in any locale combo
- `<html lang>` value differs between server HTML and client `document.documentElement.lang`
- Date strings flicker on first paint of share view

**Prevention:**
1. **One source of truth: server-resolved locale, passed as a prop / via `NextIntlClientProvider`.** Never re-detect in a Client Component.
2. **Cookie wins over `Accept-Language`** in priority order: `NEXT_LOCALE` cookie → `Accept-Language` → default (`zh-Hant`). This matches next-intl convention and minimizes flicker on the user's second visit.
3. **Set `<html lang={locale}>` from the server root layout**, deterministic from the same source as the messages.
4. **Format dates/numbers server-side** via `Intl.DateTimeFormat(locale, …)` with explicit locale arg, NOT `undefined`. Never let the client pick.
5. **Add a Playwright/manual test matrix** for: no cookie + EN browser, no cookie + zh-Hant browser, cookie=en + zh-Hant browser, cookie=zh-Hant + EN browser. All four must render without console errors.
6. **Wrap any genuinely client-only locale UI** (e.g., relative-time "5 minutes ago") in `useEffect`-gated rendering with a deterministic SSR fallback.

**Addressed by:** I18N-01 (server resolution), I18N-02 (cookie priority), I18N-04 (server-set `<html lang>`)

---

### CRIT-6: `Accept-Language` auto-detection picks the wrong Chinese variant for Hong Kong / Singapore users

**What goes wrong:** I18N-01 says "auto-detect, fallback to zh-Hant." But browsers send:
- HK Edge: `zh-Hant-HK, zh-Hant;q=0.8, en-US;q=0.6`
- HK Safari: `zh-hk` (no script tag)
- China user on VPN with Taiwan IP but `zh-CN` system: `zh-CN, en;q=0.8`
- Old Chrome on Taiwan: `zh-TW, zh;q=0.9, en;q=0.8`
- Singapore: `zh-Hans-SG, en-SG`

A naïve `acceptLanguage.split(',')[0].split('-')[0] === 'zh' ? 'zh-Hant' : 'en'` rule sends a mainland Chinese user (who reads Simplified) the Traditional Chinese UI, sends a Hong Kong user (who reads Traditional) Traditional but only because of the script tag, and sends a Singapore Chinese-reader the EN UI by accident. (Sources: [polylang — zh-Hant-HK detection bug](https://github.com/polylang/polylang/issues/591), [Drupal Chinese language detection](https://www.drupal.org/project/drupal/issues/365615).)

**Why it happens specific to v2:** PROJECT.md ships zh-Hant + en only in v2, with zh-Hans/ja/ko deferred. Until zh-Hans ships, a mainland Chinese user will get EITHER zh-Hant (if zh-* maps to it) or EN (if it doesn't) — both wrong but in different ways. The choice here will be hard to reverse once users have cookies set.

**Consequences:**
- HK users complain the site "doesn't support Hong Kong" (it does — zh-Hant — but detection failed)
- Mainland users see Traditional and assume the product is Taiwan-only
- When zh-Hans ships in v2.5, users with sticky cookies don't get migrated to it

**Warning signs:**
- Disproportionate switcher usage (I18N-02 telemetry, if added) — high switch rate from default = bad detection
- Issue reports mentioning "wrong language" within first week

**Prevention:**
1. **Use a real BCP-47 matcher** — `@formatjs/intl-localematcher` or the matcher in `next-intl`. Do not parse `Accept-Language` by hand.
2. **Explicit zh-* mapping rule documented in code:**
   - `zh-Hant*` (any region) → zh-Hant
   - `zh-TW`, `zh-HK`, `zh-MO` → zh-Hant
   - `zh-Hans*`, `zh-CN`, `zh-SG`, `zh-MY` → zh-Hant for v2 (only available Chinese), but log/flag for v2.5 zh-Hans target
   - `zh` (no region/script) → zh-Hant (Taiwan-first product, per PROJECT.md)
3. **Make the switcher prominent on first visit** — a one-time toast or a visible language pill (per I18N-02) that lets the wrong-detected user fix it in one click without hunting through settings.
4. **Cookie value uses script tags** (`zh-Hant`, not `zh`) so v2.5's zh-Hans introduction doesn't have to migrate ambiguous cookies.
5. **Document the matrix** in `.planning/research/` or a code comment so future locale additions don't break it.

**Addressed by:** I18N-01 (matcher choice + mapping rules), I18N-02 (switcher prominence), I18N-05 (architecture must support adding zh-Hans without re-mapping zh-* downstream)

---

## Moderate Pitfalls

### MOD-1: Permissions-Policy header silently dropped by browser due to syntax error

**What goes wrong:** SEC-02's `Permissions-Policy: camera=(), microphone=(), geolocation=()` is correct modern syntax. Common slip-ups: leaving in legacy Feature-Policy syntax (`camera 'none'`), wrapping `none` in quotes, forgetting parentheses around the origin list, or mixing `,` and `;` separators. Browsers silently drop the entire header on parse error, not just the bad directive. (Source: [MDN Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy), [Craft CMS issue #7915](https://github.com/craftcms/cms/issues/7915).)

**Prevention:**
- Verify with `curl -I https://html2u.vercel.app` and a header parser (e.g., securityheaders.com) before claiming SEC-02 done
- Reference the MDN canonical syntax; don't copy from blog posts
- Test in DevTools Console — browser prints a parse error if the header is malformed

**Addressed by:** SEC-02 (post-deploy verification step), SEC-05 (header-presence check in the admin status panel must verify the header *parses*, not just exists)

---

### MOD-2: `X-Frame-Options: DENY` on the main app vs `frame-ancestors` on shared content — semantic clash

**What goes wrong:** PROJECT.md SEC-02 says `X-Frame-Options` "where iframing is not expected" — i.e., on `/`, `/admin`, `/tos`. But the *content* endpoint (`/s/[id]/raw`) ALREADY sets `frame-ancestors` to `APP_ORIGIN` in CSP (per CONCERNS.md). If a future feature lets users preview their share inline from `/`, applying `X-Frame-Options: DENY` blanket breaks it. Worse, if SEC-02 is applied via `next.config.ts` `headers()` without scoping, it can hit the content route too, overriding the careful CSP.

**Prevention:**
- Scope SEC-02 headers via `source` pattern, excluding `/s/:id/raw` and `/api/csp-report`
- Prefer CSP `frame-ancestors 'none'` over `X-Frame-Options: DENY` on modern app — but ship both for legacy browsers; both must agree
- When they disagree, modern browsers prefer `frame-ancestors` — verify behaviour matches intent

**Addressed by:** SEC-02 (per-route header config in `next.config.ts`)

---

### MOD-3: Legal pages (SEC-04) make retention promises the system can't keep

**What goes wrong:** A copy-pasted privacy template says "we delete data 30 days after expiry." But CORE-03's TTL is lazy-deleted on read or via the not-yet-enabled pg_cron job (CONCERNS.md: "Auto-cleanup of expired rows is commented out"). Expired rows currently persist indefinitely. The legal copy creates a liability gap.

**Why it happens specific to v2:** SEC-04 is being written in parallel with the security work, but the actual deletion mechanism is dependent on enabling pg_cron — itself outside SEC-04's scope. The writer of the copy assumes the engineering is done.

**Consequences:** A GDPR subject access request (any EU visitor — Taiwan-local doesn't shield this; the audience is "international English users" per PROJECT.md) reveals retained data past the stated TTL. DMCA takedown windows: 14 days is industry; promising 24h creates impossible SLA.

**Prevention:**
1. **SEC-04 must NOT ship before pg_cron cleanup is enabled** OR the copy must say "deleted within 7 days of expiry" (wide buffer for lazy deletion).
2. **Be specific about IP logging** (SAFE-07 already logs IPs). Say so. Disclose retention period. Promise nothing about "anonymization."
3. **DMCA: a designated agent address required** for safe harbor (Source: [DMCA Safe Harbor — PatentPC](https://patentpc.com/blog/dmca-safe-harbor-for-cloud-storage-services-avoiding-legal-traps)). For anonymous personal projects, this means publishing a real email + a real human/legal entity name. If the operator is not willing to publish a name, the DMCA template is decorative, not protective.
4. **Jurisdiction statement** — must say which country's law governs. Operator location per PROJECT.md hints Taiwan; if so, say so. Don't copy a US template with "US choice of law" if the operator is in Taiwan.
5. **Bilingual but legally binding language is the EN version** — make explicit in copy. Zh-Hant translation is informational only. This prevents translation drift from creating contradictory terms.

**Addressed by:** SEC-04 (copy review), depends on pg_cron enablement (called out in CONCERNS.md tech debt — should be referenced from SEC-04's acceptance criteria)

---

### MOD-4: CSP enforce mode breaks the existing safety banner / theme toggle JS

**What goes wrong:** SEC-02 talks about main-app headers and SEC-03 about CSP reporting. If SEC-02 happens to tighten the main-app CSP (vs only SAFE-02 which is content-CSP), the existing inline theme-bootstrap script (UX-02: "inline pre-paint bootstrap (no FOUC)") becomes a CSP violation and gets blocked, causing the FOUC the UX-02 work was designed to prevent.

**Prevention:**
1. **Roll out main-app CSP in `Content-Security-Policy-Report-Only` mode first** — collect reports for 1 week via SEC-03, then enforce. (Source: [centralcsp — enforce & report-only](https://centralcsp.com/articles/csp-enforce-report-only).)
2. **Inline scripts (the theme bootstrap) need a nonce or hash.** Next.js 16 has middleware-based nonce support; the bootstrap script must read the nonce or be re-hashed on every change.
3. **The strict content CSP (SAFE-02) stays as-is.** Do not unify main-app and content CSPs — they have different threat models.

**Addressed by:** SEC-02/SEC-03 sequencing (report-only first), SEC-05 (acceptance criterion: theme toggle still works in enforce mode)

---

### MOD-5: "Security Status panel" (SEC-05) measures the wrong thing

**What goes wrong:** SEC-05 says "at-a-glance status for each SEC-0X." The instinct is to show booleans: "Safe Browsing API: ✓ healthy." But the failure modes that matter (CRIT-1, CRIT-4) are *distribution* problems, not reachability problems. A panel that shows green when 100% of recent verdicts are "clean" or when 0 CSP reports arrived this week is misleading — both can mean "everything's fine" OR "everything's broken."

**Prevention:** SEC-05 must show, at minimum:
- Safe Browsing: lookup count last 7d, verdict distribution (clean/flagged/unknown/error), p95 latency, quota remaining (if available via Google Cloud metrics)
- Headers: last successful curl-of-self that parsed all expected headers, with the actual values shown (not just ✓/✗)
- CSP reports: deduped violation count last 7d, top 10 `violated-directive`s, top 10 `blocked-uri`s with extension noise filtered
- Legal pages: last-modified timestamp + git SHA of each page (proves a real human reviewed in the weekly review)
- Manual checklist: a list of test URLs (known-malicious samples from Google's own test URLs) with date-of-last-test and pass/fail

**Addressed by:** SEC-05 design

---

### MOD-6: Magic link click-gate broken by overly strict main-app CSP

**What goes wrong:** CONCERNS.md notes the magic link click-gate at `/m/[id]/[token]` is the defense against scrapers consuming the token. If SEC-02's `Referrer-Policy: no-referrer` is applied globally (vs the spec'd `strict-origin-when-cross-origin`), some link previewers' fallback behavior may treat the path as a direct hit. Less severe but worth flagging: a too-strict `Permissions-Policy` could disable features the click-gate uses for client-side challenge.

**Prevention:**
- Stick to `strict-origin-when-cross-origin` as PROJECT.md SEC-02 specifies; do not "harden" to `no-referrer`
- Test the magic flow before and after SEC-02 deploy with Slack/Discord/LINE link previewers

**Addressed by:** SEC-02 (sticking to spec), SEC-05 manual test list

---

## Minor Pitfalls

### MIN-1: Translation key drift between zh-Hant and en
JSON keys in `messages/zh-Hant.json` and `messages/en.json` drift. Strings in code reference keys that exist in one locale, not the other — renders the key literal at runtime.

**Prevention:** A startup or build-time check that asserts the two locale files have identical key sets. Trivial Node script; run in CI. Required for I18N-05 to actually be drop-in.

### MIN-2: `<title>` in zh-Hant + Apple SF Pro font = mojibake on uncommon browsers
Some older Android browsers don't have SF Pro Hant glyphs. The PROJECT.md DESIGN spec says SF Pro only. Without a CJK fallback in the font stack, zh-Hant `<title>` and meta description render as boxes on those browsers.

**Prevention:** Ensure font stack ends with a CJK-aware system fallback (`"PingFang TC"`, `"Noto Sans CJK TC"`, `sans-serif`). Verify on at least one Android Chrome session.

### MIN-3: Language switcher hides itself on the share view
PROJECT.md I18N-02 puts the switcher "in the top-right (next to theme toggle)." On the share view, SAFE-03 already occupies the top area with the safety banner. Stacking creates clutter or, worse, hides the switcher behind the banner on small viewports.

**Prevention:** Either omit the switcher on `/s/[id]` (locale is fixed by viewer's cookie/header, no in-page change needed) or design the banner + switcher + theme toggle as a single coherent chrome row. Defer the decision to the design phase but flag it now.

### MIN-4: `<meta name="robots" content="noindex">` translated incorrectly
SAFE-05 ships `noindex` site-wide. If a translator "localizes" the meta tag content, search engines stop honoring it. Unlikely with a careful dev, but a hand-edit of HTML templates that doesn't know meta content is a string literal can break this.

**Prevention:** Keep meta tag values as constants in code, never inside translation files. Document this explicitly.

### MIN-5: Safe Browsing API key leaked via client-side fetch
Easy mistake: `NEXT_PUBLIC_SAFE_BROWSING_KEY` instead of server-only `SAFE_BROWSING_KEY`. Key in `NEXT_PUBLIC_*` is shipped to every client and burns quota.

**Prevention:** Server-only env var; lookup happens in `lib/` or `app/api/` server code, never in a client component. Lint rule or code review checklist.

---

## Phase-Specific Warnings

| Requirement | Likely Pitfall | Mitigation |
|---|---|---|
| SEC-01 (Safe Browsing) | CRIT-1 fail-open, CRIT-2 false-confidence, MIN-5 key leak | Fail-closed semantics; combine with banner; server-only key |
| SEC-02 (Headers) | CRIT-3 HSTS lock-in, MOD-1 syntax silent drop, MOD-2 XFO vs frame-ancestors, MOD-4 main CSP breaking inline theme, MOD-6 referrer-policy too strict | Report-only CSP first; per-route header scoping; verify with parser; avoid preload on `.vercel.app` |
| SEC-03 (CSP reports) | CRIT-4 endpoint flood / DB blowout | Rate-limit + dedupe + extension filter + TTL + policy-hash echo verification |
| SEC-04 (Legal pages) | MOD-3 promises system can't keep, DMCA agent unstated | Block on pg_cron enablement; designate real agent; jurisdiction explicit; EN as binding |
| SEC-05 (Status panel) | MOD-5 measures reachability not health | Distribution + latency + verdict mix, not booleans |
| I18N-01 (Auto-detect) | CRIT-5 hydration mismatch, CRIT-6 wrong Chinese variant | Server-resolve only; BCP-47 matcher; explicit zh-* mapping doc |
| I18N-02 (Switcher) | MIN-3 collision with safety banner, CRIT-5 client-side re-detection | Server prop, never `navigator.language`; design top-bar coherently |
| I18N-03 (Coverage) | MIN-1 key drift, MIN-4 meta translated by accident | CI key-parity check; meta constants in code |
| I18N-04 (Metadata) | MIN-2 mojibake on uncommon browsers | CJK font fallback |
| I18N-05 (Drop-in locales) | Cookie format doesn't survive zh-Hans addition | Cookie stores BCP-47 with script tag, never bare `zh` |

---

## Sources

- [Google Safe Browsing v4 — Usage limits](https://developers.google.com/safe-browsing/v4/usage-limits) — HIGH
- [Google Safe Browsing v4 — Overview](https://developers.google.com/safe-browsing/v4) — HIGH
- [afilipovich/gglsbl — 100s quota issue #22](https://github.com/afilipovich/gglsbl/issues/22) — MEDIUM (community)
- [Penligent — Bypass link explained](https://www.penligent.ai/hackinglabs/bypass-link-explained-how-attackers-evade-protections-and-how-defenders-secure-urls/) — MEDIUM
- [DebugBear — CSP error noise from Chrome extensions](https://www.debugbear.com/blog/chrome-extension-csp-error-noise) — HIGH (empirical measurement)
- [Dropbox tech blog — On CSP reporting and filtering](https://dropbox.tech/security/on-csp-reporting-and-filtering) — HIGH (production experience)
- [websec/CSPAM — CSP report flood tool](https://github.com/websec/CSPAM) — MEDIUM
- [OWASP HSTS cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html) — HIGH
- [Vercel — Encryption and TLS](https://vercel.com/docs/cdn-security/encryption) — HIGH
- [Vercel issue #10964 — HSTS preload detection on vercel.app](https://github.com/vercel/vercel/issues/10964) — MEDIUM
- [MDN — Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) — HIGH
- [Chrome blog — COOP restrict-properties](https://developer.chrome.com/blog/coop-restrict-properties) — HIGH
- [Next.js discussion #51135 — COOP blocking Google auth](https://github.com/vercel/next.js/discussions/51135) — MEDIUM
- [MDN — Permissions-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy) — HIGH
- [Craft CMS issue #7915 — Permissions-Policy parse error](https://github.com/craftcms/cms/issues/7915) — MEDIUM
- [centralcsp — CSP enforce vs report-only](https://centralcsp.com/articles/csp-enforce-report-only) — MEDIUM
- [next-intl — Routing configuration](https://next-intl.dev/docs/routing/configuration) — HIGH
- [next-intl — Request configuration](https://next-intl.dev/docs/usage/configuration) — HIGH
- [Next.js — Hydration errors](https://nextjs.org/docs/messages/react-hydration-error) — HIGH
- [polylang issue #591 — zh-Hant-HK wrong detection](https://github.com/polylang/polylang/issues/591) — MEDIUM
- [Drupal issue #365615 — Chinese language detection](https://www.drupal.org/project/drupal/issues/365615) — MEDIUM
- [MDN — Accept-Language](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Language) — HIGH
- [DMCA Safe Harbor for Cloud Storage — PatentPC](https://patentpc.com/blog/dmca-safe-harbor-for-cloud-storage-services-avoiding-legal-traps) — MEDIUM
- [Kiteworks — GDPR and file sharing](https://www.kiteworks.com/secure-file-sharing/how-gdpr-data-privacy-laws-impact-secure-file-sharing/) — MEDIUM
