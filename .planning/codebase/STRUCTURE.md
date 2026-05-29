# Codebase Structure

**Analysis Date:** 2026-05-29

## Directory Layout

```
html_to_web_test/           # Project root
├── app/                    # Next.js App Router — all pages, routes, and components
│   ├── _components/        # Shared React components (all client-side)
│   ├── admin/              # Admin dashboard page
│   │   └── page.tsx
│   ├── api/                # API route handlers
│   │   ├── auth/
│   │   │   └── [...nextauth]/route.ts
│   │   ├── report/
│   │   │   └── route.ts
│   │   └── shares/
│   │       └── route.ts
│   ├── m/                  # Magic link interstitial
│   │   └── [id]/
│   │       └── [token]/
│   │           └── page.tsx
│   ├── s/                  # Share viewer
│   │   └── [id]/
│   │       ├── page.tsx
│   │       └── raw/
│   │           └── route.ts
│   ├── actions.ts          # All Server Actions ("use server")
│   ├── globals.css         # Global CSS — design tokens, layout utilities
│   ├── layout.tsx          # Root layout — theme bootstrap, ThemeToggle
│   ├── page.tsx            # Home page — CreateForm
│   ├── robots.ts           # Blocks all search engine crawling
│   └── favicon.ico
├── lib/                    # Server-only business logic and utilities
│   ├── backend.ts          # Storage backend interface + Supabase/File implementations
│   ├── config.ts           # Env var reads, rate limit constants, TTL options
│   ├── session.ts          # HMAC-signed cookie token creation/verification
│   └── shares.ts           # Share domain logic (create, verify, consume, rate limit)
├── supabase/               # Supabase database schema
│   └── schema.sql          # Table DDL + RLS + stored functions (consume_share, incr_rate, etc.)
├── public/                 # Static assets served at /
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── .planning/              # GSD planning artifacts (not shipped)
│   └── codebase/
├── .data/                  # Dev-only runtime data (gitignored)
│   ├── shares/             # FileBackend share JSON files (.data/shares/<id>.json)
│   └── rate/               # FileBackend rate limit JSON files (.data/rate/<bucket>.json)
├── auth.ts                 # NextAuth configuration (Google OAuth for admin)
├── next.config.ts          # Next.js config (React Compiler enabled)
├── tsconfig.json           # TypeScript config (path alias: @/ → project root)
├── package.json
├── package-lock.json
├── AGENTS.md               # Agent/AI instructions for this repo
├── CLAUDE.md               # Claude-specific instructions
├── README.md               # Project documentation
└── .env.example            # Template for required environment variables
```

## Directory Purposes

**`app/`:**
- Purpose: All Next.js App Router routes and UI
- Contains: Page files (`page.tsx`), route handlers (`route.ts`), one Server Actions file (`actions.ts`), root layout, global CSS
- Key files: `app/actions.ts`, `app/layout.tsx`, `app/page.tsx`, `app/s/[id]/page.tsx`

**`app/_components/`:**
- Purpose: Reusable client React components shared across pages
- Contains: Only client components (`"use client"` directive required); these are leaf-level interactive nodes
- Key files: `CreateForm.tsx`, `SafetyBanner.tsx`, `MagicLanding.tsx`, `PasswordForm.tsx`, `AdminLogin.tsx`, `ThemeToggle.tsx`

**`app/api/`:**
- Purpose: REST-style HTTP API routes for programmatic access and callbacks
- Contains: Route handler files (`route.ts`) only — no page files
- Key files: `app/api/shares/route.ts` (programmatic share creation), `app/api/report/route.ts` (abuse reports), `app/api/auth/[...nextauth]/route.ts` (OAuth handler)

**`app/s/[id]/`:**
- Purpose: Share viewer with authorization gate
- Contains: `page.tsx` (RSC that decides access and renders iframe), `raw/route.ts` (serves actual HTML with CSP)
- Key files: `app/s/[id]/page.tsx`, `app/s/[id]/raw/route.ts`

**`app/m/[id]/[token]/`:**
- Purpose: Magic link one-time consumption interstitial
- Contains: Single `page.tsx` (RSC that validates token, renders `MagicLanding` client component)

**`lib/`:**
- Purpose: Server-only business logic — never imported by client-side code
- Contains: Domain logic, storage abstraction, crypto utilities, env config
- Key files: `lib/backend.ts` (storage), `lib/shares.ts` (domain), `lib/session.ts` (tokens), `lib/config.ts` (env)

**`supabase/`:**
- Purpose: Database schema definitions for Supabase/Postgres
- Contains: `schema.sql` with table DDL, RLS setup, and SECURITY DEFINER functions

**`public/`:**
- Purpose: Static files served directly from the web root
- Contains: SVG icons only (Next.js defaults); no application-specific static assets currently

**`.data/`:**
- Purpose: Dev-only runtime persistence for `FileBackend`
- Generated: Yes (created at runtime by `FileBackend`)
- Committed: No (gitignored)

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Home page — share creation UI
- `app/s/[id]/page.tsx`: Share viewer — authorization + sandboxed iframe
- `app/m/[id]/[token]/page.tsx`: Magic link interstitial
- `app/admin/page.tsx`: Admin moderation dashboard
- `app/s/[id]/raw/route.ts`: Raw HTML delivery endpoint
- `app/api/shares/route.ts`: Programmatic share creation API

**Configuration:**
- `lib/config.ts`: All environment variable reads, rate limit thresholds, TTL options, feature flags
- `auth.ts`: NextAuth Google OAuth configuration and admin email enforcement
- `next.config.ts`: Next.js build configuration
- `tsconfig.json`: TypeScript config, defines `@/` path alias
- `.env.example`: Documents all required/optional environment variables

**Core Logic:**
- `app/actions.ts`: All Server Actions — single source of truth for mutations
- `lib/shares.ts`: Share domain logic (create, verify password, consume magic link, rate limit)
- `lib/backend.ts`: Storage interface + both backend implementations
- `lib/session.ts`: HMAC token creation and verification for stateless auth cookies

**Database Schema:**
- `supabase/schema.sql`: Table DDL for `shares` and `rate_limits`, RLS, stored functions

**Styles:**
- `app/globals.css`: Design tokens (CSS custom properties), layout utility classes, component styles

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention, lowercase)
- Route handlers: `route.ts` (Next.js convention, lowercase)
- React components: `PascalCase.tsx` (e.g., `CreateForm.tsx`, `SafetyBanner.tsx`)
- Library modules: `camelCase.ts` (e.g., `backend.ts`, `shares.ts`, `session.ts`)
- Server Actions file: `actions.ts` (singular, lowercase)

**Directories:**
- Route segments: lowercase with hyphens or parameter notation (e.g., `[id]`, `[token]`, `raw`)
- Component collection: `_components/` (underscore prefix marks as non-route folder in App Router)
- Library: `lib/` (conventional)

**TypeScript:**
- Types/interfaces: `PascalCase` (e.g., `StoredShare`, `ShareSummary`, `ActionState`, `Backend`)
- Type aliases for string unions: `PascalCase` (e.g., `ShareMode`, `TtlKey`)
- Functions: `camelCase` (e.g., `createShare`, `verifyToken`, `rateLimit`)
- Constants: `SCREAMING_SNAKE_CASE` for env-derived values and limits (e.g., `ADMIN_COOKIE`, `MAX_HTML_BYTES`, `CREATE_LIMIT`)
- Boolean feature flags: `HAS_` prefix (e.g., `HAS_SUPABASE`, `HAS_GOOGLE_AUTH`)

## Where to Add New Code

**New public-facing page:**
- Page component: `app/<route-name>/page.tsx`
- Any interactive client sub-components: `app/_components/<ComponentName>.tsx` (add `"use client"`)
- Any mutations: add a Server Action function to `app/actions.ts`

**New API endpoint:**
- Route handler: `app/api/<endpoint-name>/route.ts`
- Export named functions `GET`, `POST`, etc.
- Add rate limiting via `rateLimit()` from `lib/shares.ts`

**New business logic:**
- Domain logic operating on shares: add to `lib/shares.ts`
- New config constant or env var: add to `lib/config.ts`
- New token type: add to `lib/session.ts`
- New storage operation: add method to `Backend` interface in `lib/backend.ts`, implement in both `SupabaseBackend` and `FileBackend`

**New client component:**
- File: `app/_components/<ComponentName>.tsx`
- Must have `"use client"` at top
- Accept Server Action as a prop (bound with `.bind(null, ...)`) rather than importing directly from `app/actions.ts`

**New database object:**
- Add to `supabase/schema.sql` (table, index, RLS policy, or function)
- Update `lib/backend.ts` `Backend` interface and both implementations
- Update `StoredShare` or `ShareSummary` types in `lib/backend.ts` if adding fields

**Utilities shared across lib modules:**
- Add to the most specific existing `lib/` file, or create a new `lib/<name>.ts`
- Never import from `app/` inside `lib/`

## Special Directories

**`.next/`:**
- Purpose: Next.js build output and development cache
- Generated: Yes (by `next build` / `next dev`)
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: GSD planning documents and codebase analysis
- Generated: Yes (by GSD commands)
- Committed: Yes

**`.vercel/`:**
- Purpose: Vercel deployment configuration and project metadata
- Generated: Yes (by Vercel CLI)
- Committed: Partially (`.vercel/project.json` is typically committed; `.vercel/output/` is not)

**`supabase/`:**
- Purpose: SQL schema definitions to be run manually in Supabase SQL editor
- Generated: No (hand-authored)
- Committed: Yes

**`node_modules/`:**
- Purpose: Installed npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (gitignored)

---

*Structure analysis: 2026-05-29*
