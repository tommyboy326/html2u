@AGENTS.md

<!-- GSD:project-start source:PROJECT.md -->
## Project

**html2u**

A public, anonymous service that turns AI-generated HTML into shareable links.
Anyone — engineer or not — can paste/upload an HTML snippet and immediately
get a URL that renders the page in a sandboxed iframe, optionally protected by
a password or a one-time "magic" link, and auto-expires. Live at
https://html2u.vercel.app.

Audience: Taiwan-local users (zh-Hant primary), international English users
(en), and longer-term Hong Kong / Mainland (zh-Hans) and Japan / Korea
(ja, ko).

**Core Value:** **The link the user sends to their counterpart shows the HTML they intended —
nothing else gets to steal data, hijack the tab, or weaponize the page against
the viewer.** Everything else (admin UX, theme polish, i18n) can fail; this
trust contract cannot.

### Constraints

- **Tech stack**: Next.js 16 + Supabase + Auth.js v5 + Vercel — locked; established and shipped
- **Hosting budget**: Vercel hobby tier — no paid features (BotID, advanced WAF) in this milestone
- **Translation budget**: zh-Hant + en in v1 to validate i18n architecture before paying for more locales
- **Schema migrations**: Backward-compatible only (production data lives in Supabase); no destructive changes without a deliberate migration step
- **Public-facing**: Anonymous service hosting third-party HTML — legal pages (ToS/Privacy/DMCA) are mandatory for v2
- **Performance**: Serverless cold-start tolerant; no long-running background processes
- **No regressions**: Existing v1 capabilities (CORE-01..04, SAFE-01..08, ADMIN-01..02, UX-01..03) must remain working
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.x - All source files (`app/`, `lib/`, `auth.ts`, `next.config.ts`)
- SQL - Supabase schema and stored procedures (`supabase/schema.sql`)
- CSS - Global styles (`app/globals.css`)
## Runtime
- Node.js v24.x (detected at analysis time; no `.nvmrc` pin present)
- npm
- Lockfile: `package-lock.json` present
## Frameworks
- Next.js 16.2.6 - Full-stack React framework (App Router); server actions, API routes, SSR
- React 19.2.4 - UI rendering
- next-auth 5.0.0-beta.31 (Auth.js v5) - Session management and Google OAuth provider (`auth.ts`)
- React Compiler (babel-plugin-react-compiler 1.0.0) - Enabled via `next.config.ts` (`reactCompiler: true`)
## Key Dependencies
- `@supabase/supabase-js` ^2.106.2 - Production database client; used exclusively via service-role key (`lib/backend.ts`)
- `bcryptjs` ^3.0.3 - Password hashing for password-protected shares (`lib/shares.ts`)
- `nanoid` ^5.1.11 - Collision-resistant URL-safe ID and magic token generation (`lib/shares.ts`)
- Node.js `crypto` (built-in) - HMAC-SHA256 for stateless session tokens (`lib/session.ts`)
- Node.js `fs` (built-in) - Local file-based dev backend under `.data/` (`lib/backend.ts`)
## Configuration
- All runtime config read from environment variables via `lib/config.ts`
- Required in production:
- Optional:
- `tsconfig.json` - TypeScript; target ES2017, strict mode, path alias `@/*` → `./*`
- `next.config.ts` - Next.js config; React Compiler enabled
- `.env.example` - Template for all required environment variables
## Platform Requirements
- Node.js 20+ recommended (package type declarations require `@types/node ^20`)
- No Supabase required locally; `FileBackend` in `.data/` is the fallback
- Vercel (`.vercel/project.json` present; project name `html2u`, org linked)
- Supabase Postgres (service-role key required; RLS enabled, bypassed by service key)
- Separate `CONTENT_ORIGIN` domain strongly recommended for user HTML isolation
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: PascalCase, `.tsx` extension — e.g., `CreateForm.tsx`, `SafetyBanner.tsx`
- Server actions: camelCase noun+verb, `.ts` — e.g., `actions.ts`
- API routes: `route.ts` under feature directories
- Library modules: camelCase noun, `.ts` — e.g., `backend.ts`, `session.ts`, `shares.ts`, `config.ts`
- Next.js pages: `page.tsx` under route directories
- Server actions: `camelCase` + `Action` suffix — e.g., `createShareAction`, `unlockAction`, `consumeMagicAction`, `adminDeleteAction`
- Helper functions: camelCase descriptive verbs — e.g., `clientIp()`, `baseUrl()`, `buildCsp()`, `rowToShare()`, `toSummary()`
- Internal (non-exported) helpers: camelCase, no suffix — e.g., `sign()`, `fileFor()`, `fmt()`
- Exported predicates/checks: `is` prefix or noun phrase — e.g., `isAdmin()`, `isAdminEmail()`, `verifyToken()`, `verifySharePassword()`
- Module-level config constants: UPPER_SNAKE_CASE — e.g., `ADMIN_TTL`, `MAX_HTML_BYTES`, `CREATE_LIMIT`, `TOKEN_RE`
- Boolean feature flags: `HAS_` prefix — e.g., `HAS_GOOGLE_AUTH`, `HAS_SUPABASE`
- Computed booleans: `IS_` prefix — e.g., `IS_PROD`
- Local variables: camelCase — e.g., `passwordHash`, `magicToken`, `ttlSeconds`
- Cookie name constants: UPPER_SNAKE_CASE string — e.g., `ADMIN_COOKIE`
- Types: PascalCase — e.g., `StoredShare`, `ShareSummary`, `ShareMode`, `ActionState`, `TtlKey`, `Theme`
- Interfaces: PascalCase — e.g., `Backend`
- Internal DB row types: PascalCase — e.g., `Row`
- Union string literals for discriminated state: lowercase strings — e.g., `"link" | "password" | "magic"`
- Inline prop types (not extracted to separate `Props` type) — e.g., `{ id: string }`, `{ action, oneTime }`, `{ configured: boolean }`
## Code Style
- No Prettier or ESLint config file present — relies on TypeScript strict mode and Next.js defaults
- 2-space indentation (consistent throughout)
- Double quotes for JSX attributes and strings
- Semicolons: present (consistent)
- Trailing commas: present in multi-line objects/arrays
- `strict: true` in `tsconfig.json` — all strict checks enabled
- Explicit return types on all exported functions — e.g., `Promise<boolean>`, `Promise<ActionState>`, `Promise<void>`
- `type` keyword used for object shapes and union types; `interface` used for the `Backend` contract
- `as const` used for literal-typed objects — e.g., `TTL_OPTIONS`
- Type narrowing preferred over casting; `as` casts only for external data where type is known — e.g., `data as Row[]`
- `null` used for "absent" database fields; `undefined` used for optional function parameters (`title?: string`)
- React Compiler enabled (`reactCompiler: true` in `next.config.ts`) — no manual `useMemo`/`useCallback`
- Server components by default; `"use client"` directive only when browser APIs or hooks are needed
- `"use server"` directive at the top of `app/actions.ts` for the entire server actions module
- `useActionState` hook pattern for all form/action state in client components
- No class components; all function components
## Import Organization
- `@/*` maps to project root (defined in `tsconfig.json`)
- All cross-directory imports use `@/` — e.g., `@/lib/config`, `@/app/actions`, `@/app/_components/CreateForm`
- Within `lib/`, relative imports are used — e.g., `import { backend } from "./backend"`
- `lib/shares.ts` re-exports types from `backend.ts` as the public API surface: `export type { ShareMode, StoredShare, ShareSummary } from "./backend"`
## Error Handling
- Return `ActionState` object with `error` string on failure — never throw from exported actions
- Catch block pattern: `catch (e) { return { error: e instanceof Error ? e.message : "建立失敗" }; }`
- Guard clauses at the top of actions: check rate limit, check auth, validate input — return early with error
- Early return pattern: `if (!condition) return { error: "message" };`
- Throw `new Error("message")` for invalid input — callers catch these
- Return `null` for "not found" or "unauthorized" cases — e.g., `getShare`, `verifySharePassword`, `consumeMagicLink`
- All `null` returns must be handled by callers (enforced by strict TypeScript)
- Supabase errors are always rethrown: `if (error) throw new Error(error.message);`
- Return `Response.json({ error: "..." }, { status: NNN })` for all error cases
- Explicit `try/catch` around JSON parsing
- Same error cascade pattern as server actions: rate limit → parse → validate → execute
- Silent fallbacks for non-critical operations: `catch { /* clipboard blocked */ }`, `catch { /* ignore */ }`
- User-visible errors rendered as `<p className="error">{state.error}</p>` from action state
- All IDs and tokens validated with `TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/` before any backend call
- Return `null` (not error) when token validation fails — avoids leaking information
## Logging
- Warning on misconfiguration at startup in `lib/backend.ts`: `console.warn("[backend] Supabase not configured…")`
- No `console.log` in any file — logging is minimal by design
- Errors are surfaced to users via `ActionState.error` or HTTP response bodies, not logs
## Comments
- File-level block comment explaining module responsibility — e.g., top of `backend.ts`, `session.ts`, `shares.ts`
- Section dividers with `// --- Section Name ---` dashes to group related functions — used in `actions.ts`, `shares.ts`, `backend.ts`
- Inline comments on non-obvious constants: `const ADMIN_TTL = 60 * 60 * 8; // admin stays logged in 8h`
- Security rationale inline: `// No allow-same-origin (can't touch our origin)…`
- Inline `/* gone */` and `/* skip */` to document intentional silent catches
- No JSDoc/TSDoc — types are self-documenting via TypeScript
- Comments are in English for code; UI strings are Traditional Chinese (zh-Hant)
## Function Design
- Options object pattern for functions with 3+ parameters — e.g., `createShare(opts: { html, mode, password?, ... })`
- Primitive parameters for 1–2 arg functions — e.g., `getShare(id: string)`, `rateLimit(bucket, limit, windowSeconds)`
- Server action signature follows React's `useActionState` contract: `(prev: ActionState, formData: FormData) => Promise<ActionState>`
- Partial application via `.bind(null, id)` to wire server actions to client components — e.g., `unlockAction.bind(null, id)`
- Always return an explicit type — never `any`
- `null` for absent/not-found data
- `boolean` for validation/auth checks
- `ActionState` object for server actions (never raw throws)
- `void` for fire-and-forget operations
## Module Design
- Named exports for all library functions and types
- Default export only for React components
- `lib/config.ts` is the single source of truth for all environment values — nothing reads `process.env` directly except `lib/config.ts` and `lib/backend.ts`
- Not used — imports always reference the specific module file
- `lib/shares.ts` acts as a facade over `lib/backend.ts`, exposing a cleaner public API
- `backend()` in `lib/backend.ts` uses module-level `_backend` variable as lazy singleton — returns either `SupabaseBackend` or `FileBackend` based on config
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- Pages and route handlers are React Server Components by default; client components are leaf nodes that handle interactivity (`"use client"` at file top)
- All mutations flow through Server Actions in `app/actions.ts` or API route handlers — no REST calls from client for writes except abuse reporting via `SafetyBanner`
- Storage is abstracted behind a `Backend` interface in `lib/backend.ts`, allowing swap between Supabase (production) and file-based (development) without changing business logic
- Authentication uses two orthogonal paths: Google OAuth (NextAuth) for production admin access; HMAC-signed cookie tokens for per-share unlock state and dev admin login
- Uploaded HTML is never rendered on the main app origin — it is served from `/s/[id]/raw` with a strict Content-Security-Policy inside a sandboxed `<iframe>` to prevent XSS and data exfiltration
## Layers
- Purpose: Route-based pages and components; render UI, gate access, delegate actions
- Location: `app/`
- Contains: Page files (`page.tsx`), API routes (`route.ts`), client components (`_components/`)
- Depends on: Business logic layer (`lib/`), Server Actions (`app/actions.ts`), `auth.ts`
- Used by: Browser
- Purpose: Handle all form submissions and mutations with server-side validation and rate limiting
- Location: `app/actions.ts`
- Contains: `"use server"` functions — create share, unlock, consume magic, admin CRUD
- Depends on: `lib/shares.ts`, `lib/session.ts`, `lib/config.ts`, `auth.ts`
- Used by: Client components via `useActionState`, RSC pages via `.bind()`
- Purpose: Domain logic — share lifecycle, password hashing, token generation, rate limiting
- Location: `lib/shares.ts`, `lib/session.ts`, `lib/config.ts`
- Contains: Pure async functions operating on `StoredShare` types
- Depends on: `lib/backend.ts` (via `backend()` singleton), Node.js `crypto`, `bcryptjs`, `nanoid`
- Used by: `app/actions.ts`, API route handlers
- Purpose: Decouple business logic from persistence implementation
- Location: `lib/backend.ts`
- Contains: `Backend` interface + `SupabaseBackend` class + `FileBackend` class + `backend()` factory singleton
- Depends on: `@supabase/supabase-js`, Node.js `fs`
- Used by: `lib/shares.ts`
- Purpose: Google OAuth session management for admin
- Location: `auth.ts`
- Contains: NextAuth config, Google provider, `signIn` callback enforcing `ADMIN_EMAILS` allowlist
- Depends on: `lib/config.ts`
- Used by: `app/actions.ts`, `app/admin/page.tsx`
## Data Flow
### Share Creation (web form)
### Share Viewing (authorized)
### Magic Link Consumption
### Admin Authentication (Google)
- No global client state store. Client components use `useState` / `useActionState` locally.
- Per-share viewer authorization is stored in scoped httpOnly cookies (`s_<id>`) with HMAC signatures.
- Admin session is either a NextAuth JWT (Google) or an HMAC cookie (`admin_session`).
- Theme preference is persisted in `localStorage` under key `html2u-theme`.
## Key Abstractions
- Purpose: Uniform storage API hiding Supabase vs. file persistence
- Location: `lib/backend.ts:52`
- Pattern: Strategy pattern — `backend()` factory returns singleton implementing the interface based on env vars; callers never reference implementation classes
- Purpose: Canonical in-memory representation of a share record
- Location: `lib/backend.ts:19`
- Pattern: Plain TypeScript object with camelCase fields; `rowToShare()` maps snake_case Supabase rows
- Purpose: Typed return value for all Server Actions, compatible with `useActionState`
- Location: `app/actions.ts:34`
- Pattern: `{ error?: string; ok?: boolean; url?: string; expiresAt?: number; mode?: ShareMode }`
- Purpose: Stateless short-lived authorization without server-side session storage
- Location: `lib/session.ts`
- Pattern: `${expiryEpochMs}.${HMAC_SHA256(scope:expiry)}` stored in httpOnly cookies; `scope` prevents token reuse across share IDs
- Purpose: Build strict or permissive CSP for raw HTML responses
- Location: `app/s/[id]/raw/route.ts:46`
- Pattern: `allowExternal=false` blocks all outbound connections (`connect-src 'none'`, `form-action 'none'`); `allowExternal=true` only enforces `frame-ancestors`
## Entry Points
- Location: `app/page.tsx`
- Triggers: Browser GET `/`
- Responsibilities: Renders `CreateForm` — the sole public interface for share creation
- Location: `app/s/[id]/page.tsx`
- Triggers: Browser GET `/s/<id>`
- Responsibilities: Auth gate, mints raw token, renders sandboxed iframe + SafetyBanner
- Location: `app/s/[id]/raw/route.ts`
- Triggers: Iframe GET `/s/<id>/raw?t=<token>`
- Responsibilities: Token verification, HTML delivery with CSP headers, view count increment
- Location: `app/m/[id]/[token]/page.tsx`
- Triggers: Browser GET `/m/<id>/<token>`
- Responsibilities: Token validation, one-time consumption state check, renders `MagicLanding`
- Location: `app/admin/page.tsx`
- Triggers: Browser GET `/admin`
- Responsibilities: Auth check, share listing with search/pagination, delete actions
- Location: `app/api/shares/route.ts`
- Triggers: POST `/api/shares` (CLI/script use)
- Responsibilities: JSON-based share creation with same rate limiting as the web form
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
### Magic link token validation happens before consumption
## Error Handling
- Server Actions return `{ error: string }` on failure instead of throwing — compatible with `useActionState`
- `lib/shares.ts` throws `Error` on validation failure; callers in `app/actions.ts` catch and convert to `ActionState`
- Backend operations (`SupabaseBackend`) throw `Error(error.message)` on Supabase errors
- File Backend silently swallows missing-file errors (returns `null`); other failures propagate
- `recordView()` in the raw route is fire-and-forget (`catch(() => {})`) to avoid blocking content delivery
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
