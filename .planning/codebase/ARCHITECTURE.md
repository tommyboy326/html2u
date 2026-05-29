<!-- refreshed: 2026-05-29 -->
# Architecture

**Analysis Date:** 2026-05-29

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser / Client                             │
│   `app/page.tsx`   `app/s/[id]/page.tsx`   `app/m/[id]/[token]/`  │
│   `app/admin/page.tsx`                                              │
└──────────┬───────────────┬────────────────────────┬────────────────┘
           │ Server Actions│ Next.js Route Handlers  │ RSC fetch
           ▼               ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Server Layer (Next.js App Router)                 │
│                                                                     │
│  Server Actions        API Routes         RSC Page Logic            │
│  `app/actions.ts`      `app/api/shares/`  `app/s/[id]/page.tsx`    │
│                        `app/api/report/`  `app/admin/page.tsx`      │
│                        `app/s/[id]/raw/`                            │
│                        `app/api/auth/`                              │
└──────────┬──────────────────────────────────────────────────────────┘
           │ calls
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                             │
│                                                                     │
│  `lib/shares.ts`       `lib/session.ts`     `lib/config.ts`        │
│  (CRUD, rate limiting,  (HMAC token sign/   (env vars, constants,  │
│   password hashing,      verify, cookies)    rate limit thresholds) │
│   magic link lifecycle)                                             │
│                                                                     │
│  `auth.ts`                                                          │
│  (NextAuth Google OAuth for admin)                                  │
└──────────┬──────────────────────────────────────────────────────────┘
           │ calls backend()
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Storage Backend Abstraction                      │
│                  `lib/backend.ts` — Backend interface               │
│                                                                     │
│   SupabaseBackend (prod)            FileBackend (dev)               │
│   Supabase Postgres via             `.data/shares/*.json`           │
│   `@supabase/supabase-js`           `.data/rate/*.json`             │
│   (atomic RPCs for magic link                                       │
│    consumption and rate limiting)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Home Page | Entry form — paste/upload HTML, pick mode, TTL | `app/page.tsx` |
| Share Viewer | Auth gate + sandboxed iframe rendering | `app/s/[id]/page.tsx` |
| Raw Content Route | Serves HTML with strict CSP, token-gated | `app/s/[id]/raw/route.ts` |
| Magic Landing | One-time link click-to-consume interstitial | `app/m/[id]/[token]/page.tsx` |
| Admin Dashboard | List, search, delete shares; auth gate | `app/admin/page.tsx` |
| Server Actions | All mutations: create, unlock, magic, admin ops | `app/actions.ts` |
| Shares API | REST endpoint for programmatic share creation | `app/api/shares/route.ts` |
| Report API | Abuse reporting endpoint | `app/api/report/route.ts` |
| Auth Route | NextAuth Google OAuth handler | `app/api/auth/[...nextauth]/route.ts` |
| Shares Logic | Validation, password hashing, rate limiting, CRUD facade | `lib/shares.ts` |
| Session | Stateless HMAC-signed cookie tokens | `lib/session.ts` |
| Config | All env vars, rate limit constants, TTL options | `lib/config.ts` |
| Backend Interface | Storage adapter — Supabase or file-based | `lib/backend.ts` |
| Auth Config | NextAuth instance, Google provider, admin email allowlist | `auth.ts` |
| CreateForm | Client form: HTML paste/drag-drop, mode select, copy URL | `app/_components/CreateForm.tsx` |
| SafetyBanner | Anti-phishing overlay outside iframe | `app/_components/SafetyBanner.tsx` |
| MagicLanding | Client form for confirming magic link consumption | `app/_components/MagicLanding.tsx` |
| PasswordForm | Client form for entering unlock password | `app/_components/PasswordForm.tsx` |
| AdminLogin | Client form for dev-mode password admin login | `app/_components/AdminLogin.tsx` |
| ThemeToggle | Client light/dark/system toggle persisted in localStorage | `app/_components/ThemeToggle.tsx` |

## Pattern Overview

**Overall:** Next.js App Router with React Server Components + Server Actions

**Key Characteristics:**
- Pages and route handlers are React Server Components by default; client components are leaf nodes that handle interactivity (`"use client"` at file top)
- All mutations flow through Server Actions in `app/actions.ts` or API route handlers — no REST calls from client for writes except abuse reporting via `SafetyBanner`
- Storage is abstracted behind a `Backend` interface in `lib/backend.ts`, allowing swap between Supabase (production) and file-based (development) without changing business logic
- Authentication uses two orthogonal paths: Google OAuth (NextAuth) for production admin access; HMAC-signed cookie tokens for per-share unlock state and dev admin login
- Uploaded HTML is never rendered on the main app origin — it is served from `/s/[id]/raw` with a strict Content-Security-Policy inside a sandboxed `<iframe>` to prevent XSS and data exfiltration

## Layers

**Presentation Layer:**
- Purpose: Route-based pages and components; render UI, gate access, delegate actions
- Location: `app/`
- Contains: Page files (`page.tsx`), API routes (`route.ts`), client components (`_components/`)
- Depends on: Business logic layer (`lib/`), Server Actions (`app/actions.ts`), `auth.ts`
- Used by: Browser

**Action / Controller Layer:**
- Purpose: Handle all form submissions and mutations with server-side validation and rate limiting
- Location: `app/actions.ts`
- Contains: `"use server"` functions — create share, unlock, consume magic, admin CRUD
- Depends on: `lib/shares.ts`, `lib/session.ts`, `lib/config.ts`, `auth.ts`
- Used by: Client components via `useActionState`, RSC pages via `.bind()`

**Business Logic Layer:**
- Purpose: Domain logic — share lifecycle, password hashing, token generation, rate limiting
- Location: `lib/shares.ts`, `lib/session.ts`, `lib/config.ts`
- Contains: Pure async functions operating on `StoredShare` types
- Depends on: `lib/backend.ts` (via `backend()` singleton), Node.js `crypto`, `bcryptjs`, `nanoid`
- Used by: `app/actions.ts`, API route handlers

**Storage Abstraction Layer:**
- Purpose: Decouple business logic from persistence implementation
- Location: `lib/backend.ts`
- Contains: `Backend` interface + `SupabaseBackend` class + `FileBackend` class + `backend()` factory singleton
- Depends on: `@supabase/supabase-js`, Node.js `fs`
- Used by: `lib/shares.ts`

**Auth Layer:**
- Purpose: Google OAuth session management for admin
- Location: `auth.ts`
- Contains: NextAuth config, Google provider, `signIn` callback enforcing `ADMIN_EMAILS` allowlist
- Depends on: `lib/config.ts`
- Used by: `app/actions.ts`, `app/admin/page.tsx`

## Data Flow

### Share Creation (web form)

1. User fills `CreateForm` client component (`app/_components/CreateForm.tsx`) and submits
2. `useActionState` calls `createShareAction` Server Action (`app/actions.ts:120`)
3. `createShareAction` checks rate limit via `rateLimit()` (`lib/shares.ts:119`), then calls `createShare()` (`lib/shares.ts:13`)
4. `createShare` validates HTML, generates `nanoid()` ID, hashes password (if `password` mode) or generates `magicToken` (if `magic` mode), builds `StoredShare` record
5. `backend().create(record)` persists to Supabase or file store (`lib/backend.ts`)
6. Returns `{ id, expiresAt, mode, magicToken? }` back to Server Action, which returns `ActionState` with the shareable URL
7. `CreateForm` renders success card with copy-to-clipboard URL

### Share Viewing (authorized)

1. Browser navigates to `/s/[id]` — RSC page `app/s/[id]/page.tsx`
2. Page calls `getShare(id)` to verify share exists and is not expired
3. Page checks `share:<id>` cookie against HMAC token via `verifyToken()` (`lib/session.ts`)
4. If authorized (link mode always passes; cookie required for password/magic), page mints a short-lived `raw:<id>` token and builds iframe `src` pointing to `/s/[id]/raw?t=<token>`
5. Browser loads iframe from `/s/[id]/raw` route — `app/s/[id]/raw/route.ts`
6. Raw route verifies the token, fetches HTML from backend, responds with `text/html` and strict CSP headers
7. `SafetyBanner` renders outside the iframe (tamper-proof anti-phishing overlay)

### Magic Link Consumption

1. Browser navigates to `/m/[id]/[token]` — RSC page `app/m/[id]/[token]/page.tsx`
2. Page calls `getMagicShare(id, token)` to validate token without consuming it
3. If already unlocked (cookie present) → redirect to `/s/[id]`
4. If already consumed and one-time → dead-end message
5. Otherwise renders `MagicLanding` client component requiring explicit click
6. On click, `consumeMagicAction` Server Action is called (`app/actions.ts:173`)
7. `consumeMagicLink()` triggers atomic `consume_share` RPC in Supabase (or file-based equivalent)
8. On success, sets `share:<id>` unlock cookie and redirects to `/s/[id]`

### Admin Authentication (Google)

1. `/admin` page checks `isAdmin()` — calls `auth()` from NextAuth and checks `isAdminEmail()`
2. If not admin, renders Google sign-in form button (calls `loginWithGoogle` Server Action)
3. `loginWithGoogle` calls `signIn("google", ...)` which redirects to Google
4. On return, NextAuth `signIn` callback verifies email against `ADMIN_EMAILS`; denied logins redirect back to `/admin?error=...`
5. Authorized sessions can call `adminDeleteAction` to delete shares via `backend().remove()`

**State Management:**
- No global client state store. Client components use `useState` / `useActionState` locally.
- Per-share viewer authorization is stored in scoped httpOnly cookies (`s_<id>`) with HMAC signatures.
- Admin session is either a NextAuth JWT (Google) or an HMAC cookie (`admin_session`).
- Theme preference is persisted in `localStorage` under key `html2u-theme`.

## Key Abstractions

**`Backend` interface:**
- Purpose: Uniform storage API hiding Supabase vs. file persistence
- Location: `lib/backend.ts:52`
- Pattern: Strategy pattern — `backend()` factory returns singleton implementing the interface based on env vars; callers never reference implementation classes

**`StoredShare` type:**
- Purpose: Canonical in-memory representation of a share record
- Location: `lib/backend.ts:19`
- Pattern: Plain TypeScript object with camelCase fields; `rowToShare()` maps snake_case Supabase rows

**`ActionState` type:**
- Purpose: Typed return value for all Server Actions, compatible with `useActionState`
- Location: `app/actions.ts:34`
- Pattern: `{ error?: string; ok?: boolean; url?: string; expiresAt?: number; mode?: ShareMode }`

**HMAC session tokens:**
- Purpose: Stateless short-lived authorization without server-side session storage
- Location: `lib/session.ts`
- Pattern: `${expiryEpochMs}.${HMAC_SHA256(scope:expiry)}` stored in httpOnly cookies; `scope` prevents token reuse across share IDs

**CSP builder:**
- Purpose: Build strict or permissive CSP for raw HTML responses
- Location: `app/s/[id]/raw/route.ts:46`
- Pattern: `allowExternal=false` blocks all outbound connections (`connect-src 'none'`, `form-action 'none'`); `allowExternal=true` only enforces `frame-ancestors`

## Entry Points

**Home Page:**
- Location: `app/page.tsx`
- Triggers: Browser GET `/`
- Responsibilities: Renders `CreateForm` — the sole public interface for share creation

**Share Viewer:**
- Location: `app/s/[id]/page.tsx`
- Triggers: Browser GET `/s/<id>`
- Responsibilities: Auth gate, mints raw token, renders sandboxed iframe + SafetyBanner

**Raw Content Route:**
- Location: `app/s/[id]/raw/route.ts`
- Triggers: Iframe GET `/s/<id>/raw?t=<token>`
- Responsibilities: Token verification, HTML delivery with CSP headers, view count increment

**Magic Link Interstitial:**
- Location: `app/m/[id]/[token]/page.tsx`
- Triggers: Browser GET `/m/<id>/<token>`
- Responsibilities: Token validation, one-time consumption state check, renders `MagicLanding`

**Admin Dashboard:**
- Location: `app/admin/page.tsx`
- Triggers: Browser GET `/admin`
- Responsibilities: Auth check, share listing with search/pagination, delete actions

**Programmatic API:**
- Location: `app/api/shares/route.ts`
- Triggers: POST `/api/shares` (CLI/script use)
- Responsibilities: JSON-based share creation with same rate limiting as the web form

**Report API:**
- Location: `app/api/report/route.ts`
- Triggers: POST `/api/report` (SafetyBanner client component)
- Responsibilities: Rate-limited abuse report counter increment

## Architectural Constraints

- **Threading:** Single-threaded Node.js async/await throughout. No worker threads.
- **Global state:** `_backend` singleton in `lib/backend.ts:320` — initialized once per process. Safe for long-running servers; ephemeral in serverless cold starts.
- **Circular imports:** None detected. `lib/` modules do not import from `app/`; `app/actions.ts` imports from `lib/` only.
- **Serverless compatibility:** `FileBackend` is explicitly warned against in serverless deployments (`lib/backend.ts:326`). Only `SupabaseBackend` is suitable for Vercel.
- **Content origin isolation:** `CONTENT_ORIGIN` env var can point raw content to a separate domain to fully isolate user HTML from the main app's cookies and reputation. When unset, same-origin is used (still iframe-sandboxed).
- **No `allow-same-origin` on iframe:** The sandboxed iframe at `/s/[id]` sets `sandbox="allow-scripts allow-forms"` without `allow-same-origin`, so uploaded scripts cannot access the parent origin's cookies or localStorage.

## Anti-Patterns

### Duplicated `isAdmin()` logic

**What happens:** `isAdmin()` is defined both in `app/actions.ts:68` and inline in `app/admin/page.tsx:23` with identical logic.
**Why it's wrong:** Any change to admin auth logic must be made in two places; divergence can create a security gap.
**Do this instead:** Import `isAdmin` from `app/actions.ts` in `app/admin/page.tsx` — it is already exported.

### Magic link token validation happens before consumption

**What happens:** `getMagicShare` in `app/m/[id]/[token]/page.tsx` validates the token without atomically consuming it; consumption happens later in a separate Server Action.
**Why it's wrong:** In theory a race condition between two concurrent requests could both pass `getMagicShare` before either calls `consumeMagicLink`. In practice the atomic Supabase RPC (`consume_share`) is the true gate; the pre-check is just a UX guard.
**Do this instead:** Treat `getMagicShare` purely as a "does this link look valid?" pre-check and never rely on it for security guarantees — the RPC is the real lock.

## Error Handling

**Strategy:** Errors surface as typed `ActionState.error` strings returned from Server Actions; HTTP routes return `Response.json({ error })` with appropriate status codes. No global error boundary is used.

**Patterns:**
- Server Actions return `{ error: string }` on failure instead of throwing — compatible with `useActionState`
- `lib/shares.ts` throws `Error` on validation failure; callers in `app/actions.ts` catch and convert to `ActionState`
- Backend operations (`SupabaseBackend`) throw `Error(error.message)` on Supabase errors
- File Backend silently swallows missing-file errors (returns `null`); other failures propagate
- `recordView()` in the raw route is fire-and-forget (`catch(() => {})`) to avoid blocking content delivery

## Cross-Cutting Concerns

**Logging:** `console.warn` only for the serverless-without-Supabase misconfiguration warning (`lib/backend.ts:328`). No structured logging framework.
**Validation:** Input validation in `lib/shares.ts:createShare` (HTML size, password length) and regex guard `TOKEN_RE` for all ID/token parameters.
**Authentication:** Two independent auth paths — NextAuth Google OAuth for admin (JWT session), HMAC cookie tokens for share unlock state and dev admin. Configured via env vars; `HAS_GOOGLE_AUTH` flag selects the active path at runtime.
**Rate Limiting:** Fixed-window counter per IP (and per IP+share for unlock). Implemented via `Backend.incrRate()` — atomic in Supabase, best-effort in FileBackend.

---

*Architecture analysis: 2026-05-29*
