// Central configuration + secrets read from environment.

export const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-insecure-secret-change-me";

// Super-admin (the moderation dashboard at /admin).
//
// Production: Google (Gmail) login restricted to ADMIN_EMAILS. Active whenever
// AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET are set — when active, the password path
// below is fully disabled (no backdoor).
// Dev fallback: ADMIN_PASSWORD, used only when Google auth is NOT configured.
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const HAS_GOOGLE_AUTH = !!(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

// Storage. If both are set we use Supabase (Postgres); otherwise a local file
// store is used (dev only — NOT for serverless production).
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// Where the *content* (raw user HTML) is served from. Set this to a SEPARATE
// throwaway domain in production so malicious uploads can never touch the main
// app's origin / cookies / reputation. Empty = same origin (still sandboxed).
export const CONTENT_ORIGIN = (process.env.CONTENT_ORIGIN || "").replace(/\/$/, "");
// The main app origin, used for iframe CSP when CONTENT_ORIGIN differs.
export const APP_ORIGIN = (process.env.APP_ORIGIN || "").replace(/\/$/, "");

// Selectable lifetimes for a share.
export const TTL_OPTIONS = {
  "1h": 60 * 60,
  "1d": 60 * 60 * 24,
  "7d": 60 * 60 * 24 * 7,
  "30d": 60 * 60 * 24 * 30,
} as const;
export type TtlKey = keyof typeof TTL_OPTIONS;
export const DEFAULT_TTL: TtlKey = "7d";

// Abuse limits.
export const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB per share
export const CREATE_LIMIT = 30; // shares per IP ...
export const CREATE_WINDOW = 60 * 60; // ... per hour
export const UNLOCK_LIMIT = 6; // password attempts per IP per share ...
export const UNLOCK_WINDOW = 5 * 60; // ... per 5 minutes
export const REPORT_LIMIT = 10; // reports per IP ...
export const REPORT_WINDOW = 60 * 60; // ... per hour

export const IS_PROD = process.env.NODE_ENV === "production";
