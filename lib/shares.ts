// Share business logic over the storage backend: validation, id/token
// generation, password hashing, rate limiting, and admin queries.

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { backend, type ShareMode, type StoredShare } from "./backend";
import { TTL_OPTIONS, type TtlKey, MAX_HTML_BYTES } from "./config";

export type { ShareMode, StoredShare, ShareSummary } from "./backend";

const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function createShare(opts: {
  html: string;
  mode: ShareMode;
  password?: string;
  oneTime?: boolean;
  allowExternal?: boolean;
  ttl: TtlKey;
  title?: string;
  ip?: string;
}): Promise<{ id: string; expiresAt: number; mode: ShareMode; magicToken?: string }> {
  const html = opts.html ?? "";
  if (!html.trim()) throw new Error("HTML 內容不可為空");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES)
    throw new Error("HTML 內容過大(上限 2MB)");

  const ttlSeconds = TTL_OPTIONS[opts.ttl] ?? TTL_OPTIONS["7d"];
  const id = nanoid(); // 21 url-safe chars — unguessable
  const now = Date.now();

  let passwordHash: string | null = null;
  let magicToken: string | null = null;
  let oneTime = false;

  if (opts.mode === "password") {
    if (!opts.password || opts.password.length < 4)
      throw new Error("密碼至少需要 4 個字元");
    passwordHash = bcrypt.hashSync(opts.password, 10);
  } else if (opts.mode === "magic") {
    magicToken = nanoid(32);
    oneTime = opts.oneTime !== false;
  }
  // mode === "link": no password, the unguessable URL is the only gate.

  const record: StoredShare = {
    id,
    mode: opts.mode,
    html,
    passwordHash,
    magicToken,
    oneTime,
    consumedAt: null,
    title: opts.title?.slice(0, 200) || null,
    views: 0,
    reports: 0,
    allowExternal: opts.allowExternal === true,
    createdIp: opts.ip || null,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
  };

  await backend().create(record);
  return { id, expiresAt: record.expiresAt, mode: record.mode, magicToken: magicToken ?? undefined };
}

export async function getShare(id: string): Promise<StoredShare | null> {
  if (!TOKEN_RE.test(id)) return null;
  return backend().get(id);
}

export async function verifySharePassword(
  id: string,
  password: string,
): Promise<StoredShare | null> {
  const rec = await getShare(id);
  if (!rec || rec.mode !== "password" || !rec.passwordHash) return null;
  return bcrypt.compareSync(password, rec.passwordHash) ? rec : null;
}

export async function getMagicShare(
  id: string,
  token: string,
): Promise<StoredShare | null> {
  if (!TOKEN_RE.test(token)) return null;
  const rec = await getShare(id);
  if (!rec || rec.mode !== "magic" || !rec.magicToken) return null;
  return rec.magicToken === token ? rec : null;
}

export async function consumeMagicLink(
  id: string,
  token: string,
): Promise<StoredShare | null> {
  if (!TOKEN_RE.test(id) || !TOKEN_RE.test(token)) return null;
  return backend().consumeMagic(id, token);
}

export async function recordView(id: string): Promise<void> {
  if (TOKEN_RE.test(id)) await backend().incrViews(id);
}

export async function reportShare(id: string): Promise<void> {
  if (TOKEN_RE.test(id)) await backend().report(id);
}

// --- Admin -------------------------------------------------------------------

export async function listShares(opts: { limit: number; offset: number; q?: string }) {
  return backend().list(opts);
}

export async function adminDeleteShare(id: string): Promise<void> {
  if (TOKEN_RE.test(id)) await backend().remove(id);
}

// --- Rate limiting -----------------------------------------------------------

export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const n = await backend().incrRate(bucket, windowSeconds);
  return n <= limit;
}
