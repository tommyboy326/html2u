# Codebase Concerns

**Analysis Date:** 2026-05-29

## Tech Debt

**Duplicated `isAdmin()` function:**
- Issue: The admin authorization check is defined twice with identical logic — once as an exported function in `app/actions.ts` (line 68) and once as a private function in `app/admin/page.tsx` (line 23). If the auth logic changes, both must be updated.
- Files: `app/actions.ts`, `app/admin/page.tsx`
- Impact: Divergence risk. A fix applied to one copy could be missed in the other, silently reopening the admin panel to unauthorized users.
- Fix approach: Remove the private copy in `app/admin/page.tsx` and import `isAdmin` from `app/actions.ts` instead.

**`next-auth` on a beta release:**
- Issue: `next-auth` is pinned to `^5.0.0-beta.31` in `package.json`. Beta software may have breaking changes, undocumented behavior, and security patches not backported.
- Files: `package.json`, `auth.ts`
- Impact: Production stability risk; future npm updates may silently pull in a breaking beta.
- Fix approach: Monitor the `next-auth` v5 stable release; migrate once stable, or pin to an exact beta version to prevent unexpected upgrades.

**No linting or formatting toolchain:**
- Issue: No ESLint config (`.eslintrc*` or `eslint.config.*`), no Prettier config, no Biome config, and no `lint` or `format` script in `package.json`. The only scripts are `dev`, `build`, and `start`.
- Files: `package.json`
- Impact: Code style is unenforceable; type errors that TypeScript alone cannot catch may accumulate silently over time.
- Fix approach: Add `next lint` to package scripts (Next.js bundles ESLint) and a `.eslintrc.json` with `extends: ["next/core-web-vitals"]`.

**Auto-cleanup of expired rows is commented out:**
- Issue: The pg_cron jobs that delete expired `shares` and `rate_limits` rows are present in `supabase/schema.sql` but fully commented out (lines 117–119). Expired rows accumulate in the database indefinitely; query filters handle correctness but the table grows unbounded.
- Files: `supabase/schema.sql`
- Impact: Performance degradation over time; storage costs scale with all-time created shares, not active shares.
- Fix approach: Enable the `pg_cron` extension in Supabase and uncomment the two scheduled jobs, or document this as a required manual setup step in README.

**File backend is unsafe for any deployed usage:**
- Issue: `FileBackend` in `lib/backend.ts` is used automatically whenever `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are absent. A `console.warn` fires in production (line 327) but the code continues. On serverless (Vercel), the `.data/` directory is ephemeral; shares disappear on cold starts.
- Files: `lib/backend.ts`
- Impact: Silent data loss in production if Supabase env vars are not set.
- Fix approach: In production (`process.env.NODE_ENV === "production"`), throw a startup error instead of falling back to the file store, forcing correct configuration.

---

## Known Bugs

**Race condition in `FileBackend.consumeMagic`:**
- Symptoms: Under concurrent requests to the same magic link (e.g., link scanner + real user), the one-time token can be consumed multiple times before the write persists.
- Files: `lib/backend.ts` (lines 239–245)
- Trigger: Two near-simultaneous GET requests to `/m/[id]/[token]` both read the file before either writes, both see `consumedAt === null`, both succeed, both write `consumedAt`.
- Workaround: The Supabase backend is immune (atomic `UPDATE ... RETURNING`). Only affects the file backend (dev). Do not use the file backend in production.

**`adminDeleteAction` silently no-ops on auth failure:**
- Symptoms: If `isAdmin()` returns false (e.g., expired session), the delete action returns `undefined` without redirecting or returning an error. The caller (`app/admin/page.tsx`) performs no error handling on the server action's return value.
- Files: `app/actions.ts` (line 112–116)
- Trigger: Submitting the delete form after session expiry.
- Workaround: None — the delete just silently does nothing. The admin page still re-renders and shows the item.

---

## Security Considerations

**Insecure default `SESSION_SECRET`:**
- Risk: `lib/config.ts` line 4 defaults `SESSION_SECRET` to `"dev-insecure-secret-change-me"` when the env var is missing. All session tokens (admin cookie, share unlock cookie, raw content token) are HMAC-signed with this key. If deployed without setting the variable, tokens are forgeable.
- Files: `lib/config.ts`
- Current mitigation: The string name itself signals intent; `.env.example` documents it.
- Recommendations: Throw a hard startup error in production when `SESSION_SECRET` is unset or equals the default value. This is a one-line guard in `lib/config.ts`.

**Password field shown as `type="text"` in `CreateForm`:**
- Risk: When a creator sets a "password" mode share, the password input in `app/_components/CreateForm.tsx` (line 186) uses `type="text"`, not `type="password"`. The password is visible to anyone looking over the creator's shoulder and is captured by browser autofill in the wrong field type.
- Files: `app/_components/CreateForm.tsx`
- Current mitigation: None.
- Recommendations: Change `type="text"` to `type="password"` on line 186 of `CreateForm.tsx`.

**`allowExternal` CSP is essentially no CSP:**
- Risk: When `allowExternal` is `true`, the CSP for served HTML collapses to only `frame-ancestors` + `base-uri 'none'` — all `default-src`, `script-src`, `connect-src`, etc. directives are omitted. This means the user-uploaded HTML can load arbitrary external scripts, make unconstrained fetch requests, and exfiltrate visitor data.
- Files: `app/s/[id]/raw/route.ts` (lines 47–48), `app/_components/CreateForm.tsx` (lines 209–218)
- Current mitigation: The UI warns users; the `SafetyBanner` is always rendered outside the iframe.
- Recommendations: Consider adding `connect-src *` explicitly (to at least document intent) and requiring admin approval for `allowExternal` shares to limit abuse surface.

**`APP_ORIGIN` is interpolated directly into CSP `frame-ancestors` without validation:**
- Risk: `APP_ORIGIN` from `lib/config.ts` (line 38) is trimmed but not validated as a proper origin. An incorrectly set value (e.g., containing spaces or special CSP characters) would produce a malformed or bypassable `frame-ancestors` directive.
- Files: `lib/config.ts`, `app/s/[id]/raw/route.ts` (line 29)
- Current mitigation: Only set from server env; not user-controlled.
- Recommendations: Add a startup validation that `APP_ORIGIN` matches `/^https?:\/\/[^;, ]+$/` before use.

**Rate limiting trusts `x-forwarded-for` unconditionally:**
- Risk: All rate-limit buckets key on the first entry in `x-forwarded-for` (set by a proxy). If the app is directly accessible without a trusted proxy, a client can spoof this header to bypass rate limits entirely.
- Files: `app/actions.ts` (line 45), `app/api/shares/route.ts` (line 17), `app/api/report/route.ts` (line 10)
- Current mitigation: On Vercel, the platform sets `x-forwarded-for` and it cannot be spoofed by clients; the risk is low on that platform.
- Recommendations: Document that `x-forwarded-for` trust is only safe behind Vercel/trusted proxy; add a guard if the app is ever deployed bare (e.g., via Docker).

**Magic link token exposed in URL and server logs:**
- Risk: The magic link token is part of the URL path (`/m/[id]/[token]`). It will appear in server access logs, browser history, Referer headers, and link-preview scrapers. A scraper visiting the link consumes the one-time token, blocking the intended recipient.
- Files: `app/m/[id]/[token]/page.tsx`
- Current mitigation: A `getMagicShare` check and explicit "click to confirm" landing page guard against automated crawlers. `notFound()` is returned for invalid/expired tokens to avoid timing attacks.
- Recommendations: Token-in-URL is intentional architecture; the click-gate mitigates automated consumption but does not prevent log exposure.

**No HTTP security headers on the main app:**
- Risk: `next.config.ts` defines no custom `headers()` function. The main application sends no `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy` headers.
- Files: `next.config.ts`
- Current mitigation: Content is served inside sandboxed iframes; the main pages contain no user HTML.
- Recommendations: Add a `headers()` export to `next.config.ts` with at minimum `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

**No `middleware.ts` — admin route has no network-layer protection:**
- Risk: The `/admin` route's authentication check is performed entirely inside the page component (`app/admin/page.tsx`) and server action (`app/actions.ts`). There is no Next.js middleware to short-circuit unauthenticated requests before route handlers execute.
- Files: (no `middleware.ts` present)
- Current mitigation: Server-side checks block data access; the worst case is the page rendering the login form.
- Recommendations: Add a `middleware.ts` to redirect `/admin` to itself with `?error=unauthorized` for unauthenticated sessions, avoiding a full page render on every unauthenticated probe.

---

## Performance Bottlenecks

**`bcrypt.hashSync` and `bcrypt.compareSync` are synchronous:**
- Problem: `lib/shares.ts` uses `bcrypt.hashSync` (line 39) and `bcrypt.compareSync` (line 78) — both blocking operations with 10 salt rounds. On a single-threaded Node.js runtime, these block the event loop for ~80–200 ms per call.
- Files: `lib/shares.ts`
- Cause: `bcryptjs` has async variants (`bcrypt.hash` / `bcrypt.compare`); the sync variants were used instead.
- Improvement path: Replace `bcrypt.hashSync(opts.password, 10)` with `await bcrypt.hash(opts.password, 10)` and `bcrypt.compareSync(...)` with `await bcrypt.compare(...)`.

**`FileBackend.list` reads all files into memory:**
- Problem: `lib/backend.ts` `FileBackend.list()` (lines 273–298) reads every `.json` file in `.data/shares/`, deserializes them all into memory, filters, then slices. This is O(n) memory and I/O on every admin page load.
- Files: `lib/backend.ts`
- Cause: File store has no index — all filtering happens in-process.
- Improvement path: This is a dev-only backend; mitigation is to switch to Supabase for any production use. No fix needed for the file store itself.

---

## Fragile Areas

**`isAdmin` duplication creates divergence risk:**
- Files: `app/actions.ts` (line 68), `app/admin/page.tsx` (line 23)
- Why fragile: Any change to the auth mechanism (e.g., adding a second auth provider, changing cookie name) must be applied in both places.
- Safe modification: Always update `app/actions.ts` first; then delete the copy in `app/admin/page.tsx` and import from actions.
- Test coverage: No tests exist.

**`FileBackend.incrRate` has no mutex:**
- Files: `lib/backend.ts` (lines 300–317)
- Why fragile: Under concurrent requests in a local dev server (unlikely but possible), two goroutines could both read the same rate file, both see a non-expired window, and both write back `count + 1`, losing one increment. Rate limiting becomes unreliable under load.
- Safe modification: This is dev-only; acceptable as-is. Do not use in production.
- Test coverage: No tests exist.

**`SESSION_SECRET` default is a valid HMAC key:**
- Files: `lib/config.ts`, `lib/session.ts`
- Why fragile: Because the default secret is a valid string (not `undefined`), all token creation/verification silently succeeds in environments where the env var is not set. There is no crash or startup warning in development.
- Safe modification: Add a startup check: `if (IS_PROD && SESSION_SECRET === "dev-insecure-secret-change-me") throw new Error(...)`.
- Test coverage: No tests exist.

---

## Scaling Limits

**`rate_limits` table rows are never cleaned up (unless pg_cron is manually enabled):**
- Current capacity: Unbounded — one row per (bucket, window) combination, never deleted.
- Limit: At 30 creates/hour/IP with thousands of IPs, the table could grow to millions of rows.
- Scaling path: Uncomment and enable the pg_cron cleanup job in `supabase/schema.sql` (line 119). Alternatively, add a TTL-based partial index.

**`shares` table stores full HTML content (up to 2 MB per row):**
- Current capacity: Each share row can be up to 2 MB of HTML stored in a `text` column. 1,000 shares = up to 2 GB in a single Postgres table.
- Limit: Supabase free tier has 500 MB database storage; paid tiers scale.
- Scaling path: Move HTML content to object storage (S3/Supabase Storage) and store only a reference in the database. The `Backend` interface already abstracts this, making it a localized change to `SupabaseBackend.create` and `SupabaseBackend.get`.

---

## Dependencies at Risk

**`next-auth ^5.0.0-beta.31`:**
- Risk: Beta dependency in production; the `^` range allows pulling in any future `5.0.0-beta.x` automatically.
- Impact: Auth could break silently after a `npm install`.
- Migration plan: Pin to exact version (`"next-auth": "5.0.0-beta.31"`) until v5 stable is released; then migrate to stable.

---

## Missing Critical Features

**No error boundary (`error.tsx`) or custom 404 (`not-found.tsx`):**
- Problem: No `app/error.tsx`, `app/not-found.tsx`, or `app/global-error.tsx` file exists. Unhandled errors fall through to Next.js's built-in error pages, which break the app's visual design and may expose stack traces in development mode leaking into unexpected states.
- Blocks: Professional UX for broken share links, expired shares, and server-side errors.

**No automated tests of any kind:**
- Problem: There are zero test files (`.test.*`, `.spec.*`) in the repository. No test runner is configured (`jest.config.*`, `vitest.config.*` absent). There is no `test` script in `package.json`.
- Blocks: Safe refactoring of auth logic, session token logic, and rate limiting. All code paths are untested.

**No `lint` script in `package.json`:**
- Problem: There is no `lint` or `type-check` script. TypeScript errors are only surfaced during `build`.
- Blocks: Early type-error detection in development and CI.

---

## Test Coverage Gaps

**Session token creation and verification (`lib/session.ts`):**
- What's not tested: HMAC signing, expiry enforcement, timing-safe comparison, tampered token rejection.
- Files: `lib/session.ts`
- Risk: A subtle off-by-one in the expiry check or a non-timing-safe comparison path could go undetected.
- Priority: High

**Rate limiting logic (`lib/shares.ts`, `lib/backend.ts`):**
- What's not tested: Fixed-window reset, concurrent increment, limit enforcement boundary (limit vs. limit + 1).
- Files: `lib/shares.ts` (lines 119–126), `lib/backend.ts` (lines 300–317, 194–201)
- Risk: Rate limits could be off-by-one (allow `limit + 1` requests) or reset incorrectly.
- Priority: High

**Magic link one-time consumption:**
- What's not tested: Double-consumption, expired token rejection, token mismatch.
- Files: `lib/shares.ts` (lines 91–97), `lib/backend.ts` (lines 153–161, 239–246)
- Risk: A regression could allow magic links to be consumed more than once.
- Priority: High

**Admin auth gating:**
- What's not tested: Unauthenticated access to `adminDeleteAction`, isAdmin returning false when session is expired, Google vs. password fallback path selection.
- Files: `app/actions.ts`, `app/admin/page.tsx`
- Risk: A refactor of auth logic could silently open the admin panel.
- Priority: High

---

*Concerns audit: 2026-05-29*
