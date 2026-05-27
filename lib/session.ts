// Stateless, signed session tokens stored in httpOnly cookies.
//
// A token is `${expiryEpochMs}.${HMAC_SHA256(scope:expiry)}`. We never trust the
// client: on every request we recompute the HMAC with SESSION_SECRET and reject
// anything tampered with or expired. No server-side session storage required.

import crypto from "node:crypto";
import { SESSION_SECRET } from "./config";

function sign(data: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
}

export function createToken(scope: string, ttlSeconds: number): string {
  const exp = Date.now() + ttlSeconds * 1000;
  return `${exp}.${sign(`${scope}:${exp}`)}`;
}

export function verifyToken(scope: string, token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(`${scope}:${exp}`));
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

export const ADMIN_COOKIE = "admin_session";
export const shareCookie = (id: string) => `s_${id}`;
