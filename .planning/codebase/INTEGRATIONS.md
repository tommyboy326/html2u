# External Integrations

**Analysis Date:** 2026-05-29

## APIs & External Services

**Google OAuth:**
- Google Sign-In - Admin dashboard authentication (production primary)
  - SDK/Client: `next-auth/providers/google` (Auth.js v5)
  - Auth env vars: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`
  - Callback URI: `https://<your-domain>/api/auth/callback/google`
  - Configured in: `auth.ts`
  - Behavior: signIn callback enforces `ADMIN_EMAILS` allowlist; unauthorized emails are rejected

## Data Storage

**Databases:**
- Supabase (Postgres) - Production backend
  - Connection env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - Client: `@supabase/supabase-js` (service-role key; RLS bypassed server-side)
  - Configured in: `lib/backend.ts` (`SupabaseBackend` class)
  - Schema: `supabase/schema.sql`
  - Tables: `public.shares`, `public.rate_limits`
  - Stored procedures (SECURITY DEFINER):
    - `consume_share(p_id, p_token)` - Atomic one-time magic link consumption
    - `incr_views(p_id)` - Increment view counter
    - `report_share(p_id)` - Increment report counter
    - `incr_rate(p_bucket, p_window_seconds)` - Fixed-window rate limit upsert
  - Optional: `pg_cron` extension for hourly expiry cleanup (commented out in schema)

**Local Dev Fallback (no Supabase):**
- `FileBackend` writes JSON files under `.data/shares/` and `.data/rate/`
- Activated when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are absent
- NOT suitable for serverless production (ephmeral filesystem)
- Configured in: `lib/backend.ts` (`FileBackend` class)

**File Storage:**
- Local filesystem only (dev fallback via `FileBackend`)
- No object storage (S3, GCS, etc.) in use

**Caching:**
- None (all routes use `force-dynamic`; no CDN cache layer configured)

## Authentication & Identity

**Auth Provider: Google (Gmail) - Production**
- Implementation: Auth.js v5 (`next-auth` 5.0.0-beta.31) with Google provider
- Entry point: `auth.ts` exports `{ handlers, signIn, signOut, auth }`
- Session validation: `auth()` call in `app/actions.ts:isAdmin()`
- Pages: sign-in and error both redirect to `/admin`
- Route: `app/api/auth/[...nextauth]` (handled by Auth.js `handlers`)

**Auth Provider: Password - Dev Fallback**
- Used only when `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are absent
- Password checked against `ADMIN_PASSWORD` env var (plaintext comparison)
- Session stored as a stateless signed cookie (`admin_session`)
- Token implementation: `lib/session.ts` — HMAC-SHA256 over `scope:expiry`, stored as `expiry.signature`

**Share Access Tokens (anonymous viewers):**
- Password shares: bcrypt verify (`bcryptjs`), then a scoped signed cookie is set for the share ID
- Magic links: one-time token embedded in URL (`/m/[id]/[token]`); consumed atomically in Supabase
- Raw HTML route: short-lived signed token passed as `?t=` query param (works cross-domain for `CONTENT_ORIGIN` isolation)
- All token logic in: `lib/session.ts`, `lib/shares.ts`, `app/actions.ts`

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, or equivalent detected)

**Logs:**
- `console.warn` in `lib/backend.ts` when Supabase is not configured in production
- No structured logging framework

## CI/CD & Deployment

**Hosting:**
- Vercel (project `html2u`, confirmed by `.vercel/project.json`)
- Project ID: `prj_gyClrBSQxJgIDyTZVhVVGZiGTiWR`

**CI Pipeline:**
- None detected (no GitHub Actions, CircleCI, or similar config files)

## Environment Configuration

**Required env vars (production):**
- `SESSION_SECRET` - Signs all stateless session/token cookies
- `AUTH_SECRET` - Auth.js v5 signing secret
- `AUTH_GOOGLE_ID` - Google OAuth client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth client secret
- `ADMIN_EMAILS` - Comma-separated list of allowed admin Gmail addresses
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service-role key (server-side only)

**Optional env vars:**
- `CONTENT_ORIGIN` - Separate domain for serving raw user HTML (security isolation)
- `APP_ORIGIN` - Main app domain (used in `frame-ancestors` CSP on content routes)
- `ADMIN_PASSWORD` - Dev-only admin password fallback

**Secrets location:**
- `.env.local` (local dev, gitignored)
- Vercel project environment variables (production)
- Template: `.env.example`

## Webhooks & Callbacks

**Incoming:**
- `POST /api/shares` - Programmatic share creation (CLI/scripts, rate-limited by IP)
- `POST /api/report` - Anonymous abuse report (rate-limited by IP)
- `GET /s/[id]/raw?t=<token>` - Raw HTML delivery route (token-gated, supports cross-origin via signed URL param)
- `/api/auth/callback/google` - Google OAuth redirect callback (handled by Auth.js)

**Outgoing:**
- None (no webhooks sent to external services)

---

*Integration audit: 2026-05-29*
