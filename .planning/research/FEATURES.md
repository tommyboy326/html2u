# Feature Landscape — Security Hardening + i18n (v2)

**Domain:** Public anonymous HTML hosting service (pastebin-class) facing a Taiwan-primary + international audience
**Researched:** 2026-05-29
**Confidence:** HIGH on legal-page and i18n patterns; MEDIUM on Safe-Browsing-as-a-gate UX (no public docs from comparable services); HIGH on CSP-report noise filtering.

This file decomposes each v2 requirement (SEC-01..05, I18N-01..05) into the discrete user-/operator-visible behaviors that comparable services ship in 2026, then sorts each behavior into **table stakes** (won't ship without), **differentiators** (above-bar trust wins), or **anti-features** (deliberately not built).

---

## 1. Phishing URL Detection on Upload (SEC-01)

What "similar services" do here: traditional pastebins (Pastebin.com, ghostbin) sit on top of post-hoc abuse-report queues, not pre-upload scanning. Image / file hosts (Imgur, Catbox) rely on the Safe Browsing list at the *consumer* side (browser warning) plus reactive removal. Newer link shorteners (Bitly, TinyURL) actively check URLs at create-time. We are closer to the link-shortener model because *our output is a URL that wraps third-party content*: rejecting at upload is cheaper than dealing with a flagged main domain later.

### Table Stakes

| Feature | Why expected | Complexity | Depends on |
|---|---|---|---|
| **Scan all `http(s)://` URLs found in uploaded HTML against Safe Browsing v5 / Web Risk Lookup** | Single most cost-effective abuse defense; covers the worst class (known phishing kits) | Low — single POST with batched `threatEntries`; v4→v5 migration deadline is 2027-03-31 so build on v5 directly | Outbound HTTPS, `SAFE_BROWSING_API_KEY` env, key is free for non-commercial |
| **Hard-reject on `MALWARE` / `SOCIAL_ENGINEERING` / `UNWANTED_SOFTWARE` matches** | Anything weaker leaves a known-phishing page live until report; defeats v2's purpose | Low | API call above |
| **Show the uploader *which* URL tripped the check, not just "rejected"** | Without this, false-positives (e.g. an `<a href>` to a legitimate but recently-listed brand-spoof) look like the service is broken; uploader cannot self-correct | Low | n/a |
| **Fail-open on API timeout/quota** (record `scan_status: "skipped"` in the share row, surface in admin) | Safe Browsing has 10k-QPD free quota and network-level failures will happen; refusing every upload during an outage is worse than letting one through with a flag | Low–Medium | DB column |
| **URL extraction must cover `href`, `src`, `action`, `formaction`, inline `style: url(...)`, `<meta http-equiv="refresh">`** | Phishing kits hide the bait URL outside `<a>` tags; partial extraction is worse than no extraction (gives false confidence) | Medium — proper HTML/CSS parse, not regex | n/a |

### Differentiators

| Feature | Value | Complexity |
|---|---|---|
| **Per-share `scan_status` in admin** (`clean` / `skipped` / `flagged: <category>`) with timestamp | Operator can sort by "skipped this week, please re-scan" and catch fail-open gaps | Low |
| **Re-scan-on-view for shares older than N hours** (cheap async check before serving raw) | Phishing list lag is 20-50 min on v4, much better on v5; a clean-at-upload page can be added to the list mid-life | Medium — needs background path or edge cache TTL on scan result |
| **Soft-flag (allow upload, badge in admin) for "suspicious"** — anything matching `THREAT_TYPE_UNSPECIFIED` or low-confidence categories | Lets operator inspect borderline content without blocking legitimate users | Low |
| **Show a friendly explainer page when rejected** ("This page links to a site Google has flagged as phishing — please check the destination") rather than a generic 400 | Builds trust; users who get a curt error assume the service is broken | Low |

### Anti-Features

| Anti-feature | Why avoid | Instead |
|---|---|---|
| **Building our own phishing-URL classifier / ML pipeline** | Years of engineering for marginal lift over Safe Browsing's list; not our domain | Lean on Safe Browsing v5 |
| **Scanning the rendered DOM headlessly** (Puppeteer per upload) | Cold-start incompatible, expensive, defeats serverless model | Static URL extraction is enough; viewer-side iframe + CSP catches dynamic exfil |
| **Blocking by domain reputation services that cost money** (e.g. Cisco Talos, VirusTotal paid) | Budget = Vercel hobby; Safe Browsing covers 80%+ at $0 | Defer to v3 if abuse rises |
| **Auto-deleting flagged shares without operator review** | False-positive risk; legit page hosting a brand-spoof screenshot would vanish silently | Flag + admin queue |

---

## 2. Legal Pages — ToS / Privacy / DMCA / Abuse (SEC-04)

What "reasonable operators" of anonymous third-party-content services publish: a four-document baseline (ToS, Privacy, DMCA/Copyright, Abuse-Report instructions), with a designated DMCA agent registered with the US Copyright Office if the operator wants 17 USC §512 safe harbor. Pastebin.com, GitHub Gist, JSFiddle, CodePen, and paste.denizenscript all converge on the same skeleton; only the contact mechanism and the verbosity vary.

### Table Stakes

These are not negotiable — shipping a public anonymous HTML host *without them* is the kind of thing that gets the Vercel project terminated after a single takedown complaint.

| Feature | Why expected | Complexity |
|---|---|---|
| **`/tos` page** stating: anonymous use permitted, but uploader warrants they own/have rights to content; prohibited content list (illegal, malware, phishing, NCII, CSAM, doxxing, IP-infringing); no warranty; right to remove without notice; governing law (Taiwan or operator's jurisdiction) | Without an enforceable ToS the operator has no contractual basis for the takedowns they will need to do | Low — copy + lawyer-review template |
| **`/privacy` page** stating: what is collected (uploader IP, User-Agent, timestamps), why (abuse tracing, rate limiting), retention (30 days = share TTL ceiling, longer for abuse logs), third parties (Supabase, Vercel, Google for Safe Browsing + admin OAuth), no cookies for tracking, no analytics, contact for data requests | GDPR/PIPL/TW PDPA all require disclosure of *purpose* and *retention* even for IPs | Low |
| **`/dmca` (or `/abuse`) page** with: takedown form fields per 17 USC §512(c)(3) (identification of work, identification of infringing material/URL, good-faith statement, accuracy-under-perjury statement, signature, contact info), counter-notification procedure, designated agent email, expected response time, repeat-infringer policy | Without this the operator does not qualify for DMCA safe harbor; one valid complaint = personal liability | Low–Medium |
| **Bilingual zh-Hant + en for all three** | Primary audience is TW; legal pages are read by complainants who may be from either jurisdiction; matches I18N-03 scope | Medium — needs lawyer-or-equivalent review in both languages, not machine translation |
| **Footer link to all legal pages visible on every page** (including `/s/[id]` viewer, but *outside* the iframe) | Required by most app-store / browser-extension review processes, expected by abuse complainants who land cold | Low |
| **"Last updated" date on every legal page** | Required by GDPR Art.13 transparency; also a signal that the operator is engaged | Low |

### Differentiators

| Feature | Value | Complexity |
|---|---|---|
| **Explicit "what we log and for how long" table** in `/privacy` (IP retained 90d for abuse, share content deleted at TTL, admin login logs 30d, rate-limit buckets 7d) | More trust than the vague "we may retain logs as needed"; competitors mostly punt on this | Low — just documentation honesty |
| **Plain-language "What you need to know" summary** at the top of each legal doc, before the formal clauses | GitHub does this; reduces complainant frustration and accidental violations | Low |
| **Public abuse-report form** (separate from in-share Report button) at `/abuse` with fields for "URL of the share", "category", "description" | Lowers friction for non-DMCA abuse (phishing, harassment) — most operators bury this in an email link | Low — reuses existing report infrastructure (SAFE-08) |
| **Transparency note**: "We have received N takedown requests, removed M, in 2026" | Cloudflare-style trust signal; cheap once the admin counter exists | Low |
| **Versioned legal pages in git** (link to `/legal/tos@v2.html`) | Allows users to see what they originally agreed to | Medium |

### Anti-Features

| Anti-feature | Why avoid | Instead |
|---|---|---|
| **Click-through "I agree" wall before upload** | Hostile UX; not legally required for free anonymous service; the public service model relies on the published ToS being binding by use | Footer link + "by uploading you agree" inline notice on CreateForm |
| **Cookie banner / consent management** | We don't run analytics or third-party cookies; banner would be theater that erodes trust | Just don't set tracking cookies |
| **Account-required DMCA submissions** | Legal requirement is email + signed statement, not a portal account | Email + web form, no auth |
| **Hosting a "warrant canary"** | Symbolic for a hobby-tier service; high upkeep cost; not warranted by threat model | Skip until operator becomes a target |
| **Promising specific takedown SLA in writing** (e.g. "within 4 hours") | Legally binding if breached; current capacity is "best effort by operator" | Use "expeditiously" — the statutory language |

---

## 3. CSP Violation Reporting (SEC-03)

What dashboards in the wild (Report-URI, URIports, csper.io, CentralCSP, Sansec for Magento, Dropbox's internal pipeline) converge on: **inbound noise from browser extensions is the dominant signal, not real attacks.** First-day-of-reporting volume is hundreds-to-thousands of reports per million page views, of which 80-95% are extension-injected scripts/styles that the legitimate user installed. Action: aggressive filtering before storage, then deduped dashboard, then alerting only on patterns.

### Table Stakes

| Feature | Why expected | Complexity | Depends on |
|---|---|---|---|
| **`/api/csp-report` endpoint accepting both `application/csp-report` (legacy report-uri) and `application/reports+json` (Reporting API report-to)** | Browser support is split through 2026 — Chromium uses report-to/Reporting-Endpoints, Safari/older Firefox still send report-uri; missing either loses half the signal | Medium | SEC-02 headers shipped first (`Reporting-Endpoints` header) |
| **Drop reports from `chrome-extension://`, `moz-extension://`, `safari-web-extension://`, `webkit-masked-url://` source files at ingest time** | These are 80-95% of raw volume; storing them makes the dashboard unusable and runs up DB cost | Low — string match on `source-file` / `blocked-uri` |
| **Drop reports where `blocked-uri` is `inline`, `eval`, or `data:` *if the violation is on the wrapper app* but **keep** them if on `/s/[id]/raw`** | Wrapper app is our code; we should never see inline violations there (would be a real attack). Raw content is third-party HTML; inline violations there are expected/uninteresting | Medium — needs `document-uri` based routing |
| **Dedup key**: hash of `(document-uri-path, violated-directive, effective-directive, blocked-uri-host, source-file-host)` with a count + first-seen + last-seen | Without dedup the table grows linearly with violations; with dedup it converges on the few real issues | Medium |
| **Per-share count column in admin** | Operator's primary need is "which shares have CSP-noisy content"; surfaces malicious patterns (one share, hundreds of report-only blocks) | Low |
| **Hard rate-limit on the endpoint (e.g. 100/IP/min, drop excess silently)** | The endpoint is unauthenticated and publicly known; DoS surface | Low — reuse rate-limit infra |
| **Cap stored payload size (e.g. 4 KB) and reject anything larger** | Some browsers send verbose `script-sample`; attackers can use this to write giant rows | Low |

### Differentiators

| Feature | Value | Complexity |
|---|---|---|
| **"Last 7 days" rollup chart in admin** showing violation count by directive | At-a-glance "is the CSP holding?" — ADMIN dashboard already exists, add one widget | Low |
| **Alert (in admin Security Status panel) when a single share generates >100 reports** | Signal of a misconfigured uploader OR an attempt to abuse the reporting endpoint as a side-channel | Medium |
| **Report-Only mode for the *wrapper* app** (different CSP from the content CSP) | Lets us tighten the main app's own CSP without breaking it; bug history shows this is how every site rolls out a new CSP | Medium — second CSP header, separate endpoint or tag |
| **"Why this was blocked" explainer link** next to each row in admin | Lowers operator's lookup cost; CSP semantics are obscure | Low — link to MDN per directive |
| **Sample-payload preview** (first 200 chars of `script-sample`) with copy-to-clipboard | Helps diagnose real attacks vs. extension noise faster | Low |

### Anti-Features

| Anti-feature | Why avoid | Instead |
|---|---|---|
| **Storing every raw report** | DB cost; signal:noise is ruinous | Filter then dedupe |
| **Auto-emailing the operator on every CSP report** | First-day flood will be hundreds; operator will mute the inbox | Threshold alerts in admin only |
| **Exposing the reporting endpoint at a guessable path that is not rate-limited** | DoS / DB-fill vector | `/api/csp-report` with hard limits |
| **Using a third-party CSP reporting service** (Report-URI, csper.io, URIports) | Cost, third-party data residency, more privacy exposure for content viewers | First-party endpoint on the same Vercel project |
| **Acting on Reporting API `crash` / `deprecation` reports** | Out of scope for v2; useful for client-error monitoring but unrelated to security | Filter them out |

---

## 4. Language Switcher UX (I18N-02)

Where the modern (post-2024) consensus has landed: language switcher belongs in the top-right corner, paired with theme toggle, using a globe icon + native-language label. The dropdown-vs-pill question splits by language count: ≤3 languages → inline pill or small button group; 4+ → globe icon opening a menu. We are at 2 in v2 with 3 more queued (zh-Hans/ja/ko), so a button that scales to a menu is the right shape.

### Table Stakes

| Feature | Why expected | Complexity | Depends on |
|---|---|---|---|
| **Switcher visible on every public page** (home, share view, password form, magic landing, admin) | Anywhere a string is rendered, the user must be able to change its language; placement consistency is non-negotiable | Low | I18N-03 |
| **Native-language labels** (`繁體中文`, `English`, not `Traditional Chinese`, `英文`) | Universal recommendation from Smashing, Smartling, Weglot guides; users may not read the language they need *labeled* in the language they currently see | Low |
| **Globe icon + current language code as the trigger** (e.g. `🌐 EN` or globe + `中`) | Recognizable across cultures (vs. country flags, which are a known anti-pattern — a flag does not equal a language) | Low |
| **Top-right placement, immediately left of theme toggle, matching Liquid Glass pill style** | Matches v1 visual system (UX-03); puts it where users actually look | Low — extend existing chrome cluster |
| **Persists selection in `NEXT_LOCALE` cookie** (1-year, `SameSite=Lax`, `Path=/`) | next-intl convention; survives across share URLs without polluting the path | Low |
| **Switching language does not navigate away** (no full-page reload that loses scroll position on long pages; soft re-render acceptable) | Cookie-set + `router.refresh()` is the standard pattern | Medium — server component re-render |
| **Accessible** — `<button>` not `<div>`, `aria-haspopup`, keyboard navigable, `aria-current="true"` on the active language | Web accessibility baseline | Low |

### Differentiators

| Feature | Value | Complexity |
|---|---|---|
| **Show all languages "above the fold" of the menu, not behind a search field** | At 2-5 languages a search box is friction; only adopt search at 10+ | Low |
| **Selected language gets a visual checkmark/tick** in the menu, not just bolded | Accessibility + at-a-glance feedback | Low |
| **Pre-rendered HTML for all available languages cached at the edge by `NEXT_LOCALE` cookie** | Faster switch; better Core Web Vitals on the locale-change path | Medium — needs `Vary: Cookie` and edge cache config |
| **`<link rel="alternate" hreflang="...">` headers** for the supported locales on indexable pages | Standard practice — but moot here since site is `noindex` per SAFE-05. Skip unless `noindex` is lifted | Low (but no payoff in current state) |

### Anti-Features

| Anti-feature | Why avoid | Instead |
|---|---|---|
| **Country flags as language icons** | Mandarin ≠ China only; English ≠ US/UK only; politically fraught (esp. TW/HK/CN context) | Globe + native text label |
| **URL-prefix routing (`/en/...`)** | Breaks `/s/<id>` URL stability across language changes; SEO benefit is zero on `noindex` site (PROJECT.md decision) | Cookie-based switching |
| **Auto-translating the content inside the iframe** (uploaded HTML) | Content is a sealed artifact; we localize chrome only | Out of scope per PROJECT.md |
| **In-place inline translation toolbar (à la Google Translate widget)** | Visual clutter; conflicts with Liquid Glass aesthetic; data leakage | Native locale switch only |
| **Language switcher inside the safety banner** | Banner is for safety messaging; muddles its purpose | Separate pill in top-right |

---

## 5. Automatic Accept-Language Detection (I18N-01 + I18N-05)

The 2026 consensus: detect on first visit, persist explicitly chosen locale, *never auto-redirect a user who has explicitly chosen*. The most-cited anti-pattern is "user clicks `English` but next visit auto-flips back to `Deutsch` because of `Accept-Language`" — Smashing, Fastly, and Smart Interface Design Patterns all call this out.

### Table Stakes

| Feature | Why expected | Complexity | Depends on |
|---|---|---|---|
| **Server-side `Accept-Language` parsing using a quality-value-aware matcher** (`@formatjs/intl-localematcher` or `negotiator`) on first request — *not* regex on the first 2 chars | Naive parsing breaks for `zh-TW,zh;q=0.9,en;q=0.8` (returns `zh-TW` correctly) vs. `en-US` (must fall through to `en`) | Low — established libraries |
| **Locale fallback chain**: requested → language-only → `defaultLocale` (zh-Hant) | Without a documented chain, a user with `ja-JP` set today sees raw keys when we haven't shipped `ja` yet | Low |
| **`NEXT_LOCALE` cookie always wins over `Accept-Language`** | Standard next-intl precedence; honours user's explicit choice | Low — next-intl handles this |
| **Detection runs in middleware/server, not client** | Client detection causes a FOUC (flash of wrong-language content); server-side avoids it; matches v1's no-FOUC theme bootstrap | Medium |
| **Missing-translation behavior: render key in English (or fall back to `en` then to key)** with a dev-mode console warning | Without this, missing keys ship as blank strings (worse than untranslated text) | Low — next-intl `getMessageFallback` |
| **Locale-aware `<html lang>` and `<title>` / `<meta description>`** per I18N-04 | Screen readers depend on `<html lang>`; search snippets depend on title/description (even though noindex, social previews still use them) | Low |

### Differentiators

| Feature | Value | Complexity |
|---|---|---|
| **"Switch to your language?" hint banner** when detected locale ≠ current locale AND no cookie set yet | The recommended pattern per Smashing/Fastly; respects user choice (vs. auto-redirect); dismissible | Medium — needs a small client component with a 2nd cookie to remember dismissal |
| **Show the hint *once per session* and never again after dismissal or explicit switch** | Repeated hints are the #1 reported annoyance with this pattern | Low — cookie-gated |
| **Hint text is in *both* the detected language and the current language** ("切換到繁體中文? / Switch to Traditional Chinese?") | User sees what they would switch to *and* what they're currently on; no guessing | Low |
| **Surface the detected-but-unsupported locale in admin** ("12 visits this week from `ja-JP` with no `ja` translation") | Signals which v2.5 locale to invest in next; cheap to add given existing IP-logging hook | Medium — needs a small counter table |
| **Locale chain support for regional variants** (zh-HK → zh-Hant fallback when zh-HK doesn't exist yet) | Lets us claim multi-region without shipping every translation; matches PROJECT.md's "drop-in locale" goal | Low — config map in `i18n.ts` |

### Anti-Features

| Anti-feature | Why avoid | Instead |
|---|---|---|
| **Auto-redirecting on `Accept-Language` without user confirmation** | The single most-criticized i18n anti-pattern; user lands on a page they didn't expect, can't get back | Hint banner, never redirect |
| **`localStorage` for locale persistence** | Not available to server components; doesn't survive cross-device; cookie is the standard | Cookie (per next-intl) |
| **Geo-IP-based locale detection** | Less accurate than `Accept-Language`; raises GDPR/PDPA concerns about IP-based profiling; adds a dependency (Vercel geo headers, MaxMind, etc.) | Browser-sent header |
| **Translating runtime-generated strings** (share IDs, hashes, error codes, timestamps in admin) | Identifiers shouldn't be translated; timestamps should be locale-formatted, not translated text | Localize `Intl.DateTimeFormat` only; keep IDs verbatim |
| **Translating user-uploaded HTML content** | Sealed artifact; explicit Out-of-Scope in PROJECT.md | Locale wrapper only |
| **"Auto" as a third option in the switcher** (system / EN / 中)| Adds cognitive load; users who want auto-detect just don't set the cookie | First-visit detection is implicitly auto; only explicit choices persist |

---

## 6. Admin Security Status Panel (SEC-05)

Not "feature landscape" research per se — this is operator-internal — but it ties together SEC-01..04 outcomes for weekly review. Captured here so REQUIREMENTS.md doesn't drop it.

### Table Stakes

| Feature | Why expected | Complexity | Depends on |
|---|---|---|---|
| **At-a-glance card for each SEC item** with status pill (green = ok, amber = degraded, red = failing) | Operator can scan in 5 seconds during weekly review | Low | SEC-01..04 implemented |
| **Safe Browsing health check**: last successful scan timestamp + 24h scan count + 24h skip count | "Is the API key still valid? Did quota hit?" answered visually | Low | SEC-01 |
| **Security headers self-check**: HEAD request to own origin, parse response headers, show present/missing per header from SEC-02 | Catches a misdeployed config; SiteSecurityScore / Mozilla Observatory do this externally | Low | SEC-02 |
| **CSP report counters (7-day)** by directive | Trend signal; spike = something changed | Low | SEC-03 |
| **Documented manual checklist** with known-bad sample URLs (Google's published Safe Browsing test page) to verify end-to-end | Cheap; catches the "we're scanning but always returning clean" silent-failure case | Low | Documentation |

### Differentiators

| Feature | Value | Complexity |
|---|---|---|
| **Weekly cron writing a snapshot to a `security_audit` table** | Historical trend (was last week worse?) | Medium |
| **One-click "run all checks now" button** in the panel | Operator doesn't have to wait for cron after a config change | Low |

### Anti-Features

| Anti-feature | Why avoid | Instead |
|---|---|---|
| **External monitoring service integration (PagerDuty, etc.)** | Out of budget; out of scope for hobby tier | Manual weekly review per PROJECT.md |
| **Email/Slack alerting from the panel** | Same as above; report-categorization-and-email is explicitly deferred to v3 | Dashboard only |

---

## Feature Dependencies

```
SEC-02 (headers, includes Reporting-Endpoints)
  └─> SEC-03 (CSP reports flow into the new endpoint)
       └─> SEC-05 admin panel (CSP card needs reports to count)

SEC-01 (Safe Browsing)
  └─> Per-share scan_status column (admin display)
       └─> SEC-05 admin panel (Safe Browsing card needs status column)

SEC-04 (legal pages)
  └─> I18N-03 (translations include the legal copy)
       └─> Footer component on every layout (UI plumbing)

I18N-01 (Accept-Language detection in middleware)
  └─> I18N-02 (switcher reads/writes the same cookie)
       └─> I18N-04 (locale flows into <html lang>, metadata)

I18N-05 (drop-in locale infrastructure) is a property of how I18N-01..04
are implemented, not a separate phase — gate I18N-03 on "adding a 6th locale
takes no code change."
```

**Implication for phase ordering:** Ship SEC-02 (headers) before SEC-03 (CSP reports) — `Reporting-Endpoints` header is a header. Ship I18N-01 before I18N-02 because the switcher's persistence cookie has to align with the detection cookie name (`NEXT_LOCALE`) from day one — changing this later breaks every existing visitor's preference. Ship SEC-04 (legal pages) and I18N-03 (translation infrastructure) in parallel; legal copy is one of the largest blocks of translated text.

---

## MVP Recommendation for v2

If anything has to slip, this is the ranked must-keep list:

1. **SEC-04 legal pages (bilingual)** — operator legal exposure if shipped without
2. **SEC-01 Safe Browsing scan + reject** — the highest-leverage abuse defense
3. **SEC-02 security headers** — one-shot config, blocks SEC-03
4. **I18N-01 + I18N-02 + I18N-03 (zh-Hant + en) as a bundle** — i18n is half-shipped or not at all
5. **SEC-03 CSP report ingest (with noise filtering from day one)** — without filtering this is worse than nothing
6. **SEC-05 admin Security Status panel** — nice but operator can survive on raw queries for one cycle

**Defer if scope pressure:** I18N-04 locale-aware metadata (cosmetic on a noindex site), the "switch to your language?" hint banner (still adds value but i18n works without it), CSP report-to/Reporting-API support (keep report-uri-only as transitional minimum and add report-to with `Reporting-Endpoints` once the basic pipeline is proven).

---

## Sources

- [Google Safe Browsing v4 Overview](https://developers.google.com/safe-browsing/v4) — HIGH confidence; deprecation notice and v5 migration deadline of 2027-03-31
- [Google Safe Browsing v4→v5 Migration Guide](https://developers.google.com/safe-browsing/reference/Migration.From.V4) — HIGH; confirms v5 free for non-commercial, Web Risk API for commercial
- [Web Risk API](https://cloud.google.com/security/products/web-risk) — HIGH; commercial-use alternative
- [Pastebin Terms of Service](https://pastebin.com/doc_terms_of_service) — HIGH; reference template for anonymous-paste service ToS
- [Pastebin Report Abuse](https://pastebin.com/report-abuse) — HIGH; reference abuse workflow
- [Denizen Pastebin ToS](https://paste.denizenscript.com/Info/Terms) — MEDIUM; alternative reference template
- [US Copyright Office — Section 512 / DMCA](https://www.copyright.gov/512/) — HIGH; safe-harbor designated-agent requirements
- [GitHub DMCA Takedown Policy](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy) — HIGH; reference notice-and-takedown procedure
- [TermsFeed DMCA Guide](https://www.termsfeed.com/blog/dmca/) — MEDIUM; takedown-notice required fields
- [Dropbox — On CSP Reporting and Filtering](https://dropbox.tech/security/on-csp-reporting-and-filtering) — HIGH; real-world noise:signal numbers
- [DebugBear — CSP Error Noise from Chrome Extensions](https://www.debugbear.com/blog/chrome-extension-csp-error-noise) — HIGH; concrete filtering strategy
- [Troy Hunt — Add-ons, Extensions and CSP Violations](https://www.troyhunt.com/add-ons-extensions-and-csp-violations-playing-nice-with-content-security-policies/) — HIGH; canonical write-up
- [csper.io — Filtering the Crap, CSP Reports](https://csper.io/blog/csp-report-filtering) — MEDIUM; specific filter rules
- [MDN — CSP `report-to` directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-to) — HIGH; March 2026 cross-browser support note
- [MDN — CSP `report-uri` directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-uri) — HIGH; legacy header still needed for Safari/older Firefox
- [Smashing Magazine — Designing A Perfect Language Selector UX](https://www.smashingmagazine.com/2022/05/designing-better-language-selector/) — HIGH; native-label and globe-icon consensus
- [Smart Interface Design Patterns — Language Selector](https://smart-interface-design-patterns.com/articles/language-selector/) — HIGH; "don't auto-redirect" rule
- [Fastly — The Elusive Perfect Language Switcher](https://dev.to/fastly/the-elusive-perfect-language-switcher-2mp9) — HIGH; banner-not-redirect pattern
- [Smartling — Language Selector Best Practices](https://www.smartling.com/blog/language-selector-best-practices) — MEDIUM; placement consensus
- [next-intl Routing Configuration](https://next-intl.dev/docs/routing/configuration) — HIGH; cookie/Accept-Language precedence
- [next-intl Middleware Docs](https://next-intl.dev/docs/routing/middleware) — HIGH; server-side detection pattern
- [next-intl Discussion #1061 — Missing-translation fallback](https://github.com/amannn/next-intl/discussions/1061) — HIGH; `getMessageFallback` pattern

**Verification notes:** Safe Browsing API state, CSP reporting standards, and next-intl behavior verified against official docs / MDN. Language-switcher UX guidance verified across 4 independent sources that converge. DMCA / ToS minimums verified against US Copyright Office primary source plus GitHub's published policy as the gold-standard practitioner. The "what comparable services do" claims for pastebin-class sites are MEDIUM confidence: based on public ToS pages and historical write-ups; no comparable service publishes their internal Safe-Browsing-integration playbook, so SEC-01 UX recommendations are extrapolated from link-shortener norms (Bitly, TinyURL) and link-scan services (urlscan.io).
