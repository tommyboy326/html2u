# Testing Patterns

**Analysis Date:** 2026-05-29

## Test Framework

**Runner:** None — no test framework is installed or configured.

No `jest.config.*`, `vitest.config.*`, or equivalent is present. `package.json` has no `test` script, no `jest`, `vitest`, `mocha`, or any test runner in `dependencies` or `devDependencies`.

**Assertion Library:** None

**Run Commands:**
```bash
# No test commands are available in this project
```

## Test File Organization

**Location:** No test files exist in the repository.

Running `find . -name "*.test.*" -o -name "*.spec.*"` (excluding `node_modules`, `.next`, `.git`) returns nothing.

**Naming:** No established convention (no examples exist).

## Test Structure

No test suites exist. The codebase has zero automated test coverage.

## Mocking

**Framework:** None

No mocking infrastructure exists. The codebase does have natural seam points that would support mocking:

- `lib/backend.ts` exposes a `Backend` interface — concrete implementations (`SupabaseBackend`, `FileBackend`) are swappable via the `backend()` singleton. A test backend could be injected by resetting the `_backend` module variable.
- `lib/config.ts` reads all config from `process.env` — tests could set environment variables before import or use `jest.resetModules()` / `vi.resetModules()` to re-evaluate config.
- `lib/session.ts` uses `crypto.createHmac` from Node's built-in `node:crypto` — testable without mocking since it is deterministic given a fixed secret.

## Fixtures and Factories

No fixture files or factory helpers exist. Sample data patterns evident in source code:

- A `StoredShare` object (defined in `lib/backend.ts:19`) would be the primary domain fixture — it has 14 fields including `id`, `mode`, `html`, `passwordHash`, `magicToken`, `expiresAt`, etc.
- A `ShareSummary` (defined in `lib/backend.ts:37`) is the safe listing version (no html/secrets).

## Coverage

**Requirements:** None enforced.

**Current Coverage:** 0% — no tests exist.

## Test Types

**Unit Tests:** Not present. High-value candidates given the codebase:
- `lib/session.ts` — `createToken` / `verifyToken` (pure crypto logic, no I/O)
- `lib/config.ts` — `isAdminEmail()` (pure function)
- `lib/shares.ts` — `createShare` validation paths, `verifySharePassword`, `rateLimit` counting
- `app/s/[id]/raw/route.ts` — `buildCsp()` (pure function, two code paths)

**Integration Tests:** Not present. High-value candidates:
- `FileBackend` CRUD operations in `lib/backend.ts` — reads/writes to `.data/` directory
- Server action flows in `app/actions.ts` — e.g., create → unlock → cookie verification

**E2E Tests:** Not used. No Playwright, Cypress, or similar tool is installed.

## Notes on Testability

The codebase is structured in a way that supports adding tests incrementally:

1. **Pure functions are isolated** — `sign()`, `createToken()`, `verifyToken()` in `lib/session.ts`; `buildCsp()` in `app/s/[id]/raw/route.ts`; `isAdminEmail()` in `lib/config.ts` — all have no side effects and can be unit tested with no mocking.

2. **Backend abstraction enables test doubles** — The `Backend` interface (`lib/backend.ts:52`) is the single contract for all storage operations. An in-memory `TestBackend implements Backend` would allow testing all of `lib/shares.ts` and `app/actions.ts` without Supabase or filesystem access.

3. **Server actions follow a consistent pattern** — All return `ActionState`. Testing them requires mocking `next/headers` (cookies, headers) and `next/navigation` (redirect).

4. **No test runner in devDependencies** — Adding tests requires first installing a runner. Vitest integrates naturally with Next.js 15+/16+ projects and TypeScript without additional Babel config. Jest requires `jest-environment-node` and `ts-jest` or SWC transforms.

---

*Testing analysis: 2026-05-29*
