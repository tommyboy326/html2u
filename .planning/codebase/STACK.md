# Technology Stack

**Analysis Date:** 2026-05-29

## Languages

**Primary:**
- TypeScript 5.x - All source files (`app/`, `lib/`, `auth.ts`, `next.config.ts`)
- SQL - Supabase schema and stored procedures (`supabase/schema.sql`)

**Secondary:**
- CSS - Global styles (`app/globals.css`)

## Runtime

**Environment:**
- Node.js v24.x (detected at analysis time; no `.nvmrc` pin present)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.2.6 - Full-stack React framework (App Router); server actions, API routes, SSR
- React 19.2.4 - UI rendering

**Auth:**
- next-auth 5.0.0-beta.31 (Auth.js v5) - Session management and Google OAuth provider (`auth.ts`)

**Build/Dev:**
- React Compiler (babel-plugin-react-compiler 1.0.0) - Enabled via `next.config.ts` (`reactCompiler: true`)

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.106.2 - Production database client; used exclusively via service-role key (`lib/backend.ts`)
- `bcryptjs` ^3.0.3 - Password hashing for password-protected shares (`lib/shares.ts`)
- `nanoid` ^5.1.11 - Collision-resistant URL-safe ID and magic token generation (`lib/shares.ts`)

**Infrastructure:**
- Node.js `crypto` (built-in) - HMAC-SHA256 for stateless session tokens (`lib/session.ts`)
- Node.js `fs` (built-in) - Local file-based dev backend under `.data/` (`lib/backend.ts`)

## Configuration

**Environment:**
- All runtime config read from environment variables via `lib/config.ts`
- Required in production:
  - `SESSION_SECRET` - Signs stateless session tokens (HMAC-SHA256)
  - `AUTH_SECRET` - Required by Auth.js v5
  - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth for admin dashboard
  - `ADMIN_EMAILS` - Comma-separated allowlist of admin Gmail addresses
  - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` - Production database
- Optional:
  - `CONTENT_ORIGIN` - Separate domain for serving raw user HTML (security isolation)
  - `APP_ORIGIN` - Main app origin used in CSP `frame-ancestors`
  - `ADMIN_PASSWORD` - Dev-only fallback when Google auth is absent

**Build:**
- `tsconfig.json` - TypeScript; target ES2017, strict mode, path alias `@/*` → `./*`
- `next.config.ts` - Next.js config; React Compiler enabled
- `.env.example` - Template for all required environment variables

## Platform Requirements

**Development:**
- Node.js 20+ recommended (package type declarations require `@types/node ^20`)
- No Supabase required locally; `FileBackend` in `.data/` is the fallback

**Production:**
- Vercel (`.vercel/project.json` present; project name `html2u`, org linked)
- Supabase Postgres (service-role key required; RLS enabled, bypassed by service key)
- Separate `CONTENT_ORIGIN` domain strongly recommended for user HTML isolation

---

*Stack analysis: 2026-05-29*
