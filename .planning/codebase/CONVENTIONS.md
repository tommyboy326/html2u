# Coding Conventions

**Analysis Date:** 2026-05-29

## Naming Patterns

**Files:**
- React components: PascalCase, `.tsx` extension — e.g., `CreateForm.tsx`, `SafetyBanner.tsx`
- Server actions: camelCase noun+verb, `.ts` — e.g., `actions.ts`
- API routes: `route.ts` under feature directories
- Library modules: camelCase noun, `.ts` — e.g., `backend.ts`, `session.ts`, `shares.ts`, `config.ts`
- Next.js pages: `page.tsx` under route directories

**Functions:**
- Server actions: `camelCase` + `Action` suffix — e.g., `createShareAction`, `unlockAction`, `consumeMagicAction`, `adminDeleteAction`
- Helper functions: camelCase descriptive verbs — e.g., `clientIp()`, `baseUrl()`, `buildCsp()`, `rowToShare()`, `toSummary()`
- Internal (non-exported) helpers: camelCase, no suffix — e.g., `sign()`, `fileFor()`, `fmt()`
- Exported predicates/checks: `is` prefix or noun phrase — e.g., `isAdmin()`, `isAdminEmail()`, `verifyToken()`, `verifySharePassword()`

**Variables and Constants:**
- Module-level config constants: UPPER_SNAKE_CASE — e.g., `ADMIN_TTL`, `MAX_HTML_BYTES`, `CREATE_LIMIT`, `TOKEN_RE`
- Boolean feature flags: `HAS_` prefix — e.g., `HAS_GOOGLE_AUTH`, `HAS_SUPABASE`
- Computed booleans: `IS_` prefix — e.g., `IS_PROD`
- Local variables: camelCase — e.g., `passwordHash`, `magicToken`, `ttlSeconds`
- Cookie name constants: UPPER_SNAKE_CASE string — e.g., `ADMIN_COOKIE`

**Types and Interfaces:**
- Types: PascalCase — e.g., `StoredShare`, `ShareSummary`, `ShareMode`, `ActionState`, `TtlKey`, `Theme`
- Interfaces: PascalCase — e.g., `Backend`
- Internal DB row types: PascalCase — e.g., `Row`
- Union string literals for discriminated state: lowercase strings — e.g., `"link" | "password" | "magic"`

**React Component Props:**
- Inline prop types (not extracted to separate `Props` type) — e.g., `{ id: string }`, `{ action, oneTime }`, `{ configured: boolean }`

## Code Style

**Formatting:**
- No Prettier or ESLint config file present — relies on TypeScript strict mode and Next.js defaults
- 2-space indentation (consistent throughout)
- Double quotes for JSX attributes and strings
- Semicolons: present (consistent)
- Trailing commas: present in multi-line objects/arrays

**TypeScript:**
- `strict: true` in `tsconfig.json` — all strict checks enabled
- Explicit return types on all exported functions — e.g., `Promise<boolean>`, `Promise<ActionState>`, `Promise<void>`
- `type` keyword used for object shapes and union types; `interface` used for the `Backend` contract
- `as const` used for literal-typed objects — e.g., `TTL_OPTIONS`
- Type narrowing preferred over casting; `as` casts only for external data where type is known — e.g., `data as Row[]`
- `null` used for "absent" database fields; `undefined` used for optional function parameters (`title?: string`)

**React:**
- React Compiler enabled (`reactCompiler: true` in `next.config.ts`) — no manual `useMemo`/`useCallback`
- Server components by default; `"use client"` directive only when browser APIs or hooks are needed
- `"use server"` directive at the top of `app/actions.ts` for the entire server actions module
- `useActionState` hook pattern for all form/action state in client components
- No class components; all function components

## Import Organization

**Order:**
1. Framework/Next.js imports — e.g., `import { cookies, headers } from "next/headers"`
2. Internal lib imports with `@/` path alias — e.g., `import { ... } from "@/lib/config"`
3. Internal auth import — `import { auth, signIn, signOut } from "@/auth"`
4. Internal component/feature imports — `import CreateForm from "@/app/_components/CreateForm"`
5. Type-only imports mixed inline using `type` keyword — e.g., `import { type TtlKey } from "@/lib/config"`

**Path Aliases:**
- `@/*` maps to project root (defined in `tsconfig.json`)
- All cross-directory imports use `@/` — e.g., `@/lib/config`, `@/app/actions`, `@/app/_components/CreateForm`
- Within `lib/`, relative imports are used — e.g., `import { backend } from "./backend"`

**Type re-exports:**
- `lib/shares.ts` re-exports types from `backend.ts` as the public API surface: `export type { ShareMode, StoredShare, ShareSummary } from "./backend"`

## Error Handling

**Server Actions:**
- Return `ActionState` object with `error` string on failure — never throw from exported actions
- Catch block pattern: `catch (e) { return { error: e instanceof Error ? e.message : "建立失敗" }; }`
- Guard clauses at the top of actions: check rate limit, check auth, validate input — return early with error
- Early return pattern: `if (!condition) return { error: "message" };`

**Library Functions (lib/):**
- Throw `new Error("message")` for invalid input — callers catch these
- Return `null` for "not found" or "unauthorized" cases — e.g., `getShare`, `verifySharePassword`, `consumeMagicLink`
- All `null` returns must be handled by callers (enforced by strict TypeScript)
- Supabase errors are always rethrown: `if (error) throw new Error(error.message);`

**API Routes:**
- Return `Response.json({ error: "..." }, { status: NNN })` for all error cases
- Explicit `try/catch` around JSON parsing
- Same error cascade pattern as server actions: rate limit → parse → validate → execute

**Client Components:**
- Silent fallbacks for non-critical operations: `catch { /* clipboard blocked */ }`, `catch { /* ignore */ }`
- User-visible errors rendered as `<p className="error">{state.error}</p>` from action state

**Token/Input Validation:**
- All IDs and tokens validated with `TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/` before any backend call
- Return `null` (not error) when token validation fails — avoids leaking information

## Logging

**Framework:** `console.warn` only (no logging library)

**Patterns:**
- Warning on misconfiguration at startup in `lib/backend.ts`: `console.warn("[backend] Supabase not configured…")`
- No `console.log` in any file — logging is minimal by design
- Errors are surfaced to users via `ActionState.error` or HTTP response bodies, not logs

## Comments

**When to Comment:**
- File-level block comment explaining module responsibility — e.g., top of `backend.ts`, `session.ts`, `shares.ts`
- Section dividers with `// --- Section Name ---` dashes to group related functions — used in `actions.ts`, `shares.ts`, `backend.ts`
- Inline comments on non-obvious constants: `const ADMIN_TTL = 60 * 60 * 8; // admin stays logged in 8h`
- Security rationale inline: `// No allow-same-origin (can't touch our origin)…`
- Inline `/* gone */` and `/* skip */` to document intentional silent catches

**Style:**
- No JSDoc/TSDoc — types are self-documenting via TypeScript
- Comments are in English for code; UI strings are Traditional Chinese (zh-Hant)

## Function Design

**Size:** Functions are small and single-purpose; largest exported function is `createShare` at ~40 lines; largest file is `backend.ts` at 335 lines

**Parameters:**
- Options object pattern for functions with 3+ parameters — e.g., `createShare(opts: { html, mode, password?, ... })`
- Primitive parameters for 1–2 arg functions — e.g., `getShare(id: string)`, `rateLimit(bucket, limit, windowSeconds)`
- Server action signature follows React's `useActionState` contract: `(prev: ActionState, formData: FormData) => Promise<ActionState>`
- Partial application via `.bind(null, id)` to wire server actions to client components — e.g., `unlockAction.bind(null, id)`

**Return Values:**
- Always return an explicit type — never `any`
- `null` for absent/not-found data
- `boolean` for validation/auth checks
- `ActionState` object for server actions (never raw throws)
- `void` for fire-and-forget operations

## Module Design

**Exports:**
- Named exports for all library functions and types
- Default export only for React components
- `lib/config.ts` is the single source of truth for all environment values — nothing reads `process.env` directly except `lib/config.ts` and `lib/backend.ts`

**Barrel Files:**
- Not used — imports always reference the specific module file
- `lib/shares.ts` acts as a facade over `lib/backend.ts`, exposing a cleaner public API

**Singleton Pattern:**
- `backend()` in `lib/backend.ts` uses module-level `_backend` variable as lazy singleton — returns either `SupabaseBackend` or `FileBackend` based on config

---

*Convention analysis: 2026-05-29*
