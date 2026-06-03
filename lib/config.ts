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

// Canonical public URL — used as metadataBase so OG / favicon / share-preview
// URLs resolve to absolute links (social scrapers require them). Falls back to
// the production domain when APP_ORIGIN is unset.
export const SITE_URL = APP_ORIGIN || "https://html2u.vercel.app";

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
export const MAX_HTML_BYTES = 1 * 1024 * 1024; // 1 MB per share
export const CREATE_LIMIT = 30; // shares per IP ...
export const CREATE_WINDOW = 60 * 60; // ... per hour
export const UNLOCK_LIMIT = 6; // password attempts per IP per share ...
export const UNLOCK_WINDOW = 5 * 60; // ... per 5 minutes
export const REPORT_LIMIT = 10; // reports per IP ...
export const REPORT_WINDOW = 60 * 60; // ... per hour

// View (read) abuse limits — applied on the raw content route. A share's HTML
// can be served at most VIEW_LIMIT_PER_IP times per IP and VIEW_LIMIT_PER_SHARE
// times across ALL IPs, per VIEW_WINDOW seconds. The per-share cap is what stops
// distributed hot-linking / image-hosting abuse (the same link fetched from many
// regions); excess requests get a tiny 429 instead of the full payload.
export const VIEW_LIMIT_PER_IP = 20; // serves per IP per share ...
export const VIEW_LIMIT_PER_SHARE = 60; // serves across all IPs per share ...
export const VIEW_WINDOW = 60; // ... per minute

// Geo-restriction for share CREATION only. Viewing stays global so a link sent
// to an overseas counterpart still opens — the spam vector is creation, not
// viewing. Comma-separated ISO-3166 country codes (Vercel's x-vercel-ip-country);
// empty string disables the restriction. Default: Taiwan only.
export const CREATE_ALLOWED_COUNTRIES = (process.env.CREATE_ALLOWED_COUNTRIES ?? "TW")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

// Returns true if a request from `country` may create shares. Fails OPEN when no
// geo header is present (local dev, or non-Vercel origin) so we never lock out
// development — on Vercel the header is always set and cannot be spoofed.
export function isCreateAllowedCountry(country: string | null | undefined): boolean {
  if (CREATE_ALLOWED_COUNTRIES.length === 0) return true; // restriction disabled
  if (!country) return true; // no edge geo header — don't block
  return CREATE_ALLOWED_COUNTRIES.includes(country.toUpperCase());
}

// Global creation throttle, ACROSS ALL IPs. The per-IP CREATE_LIMIT is useless
// against an IP-rotating botnet (each IP stays just under it); this site-wide cap
// is the backstop.
export const CREATE_GLOBAL_LIMIT = 20; // total new shares site-wide ...
export const CREATE_GLOBAL_WINDOW = 60; // ... per minute

export const IS_PROD = process.env.NODE_ENV === "production";
