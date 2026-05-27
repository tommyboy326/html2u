"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_PASSWORD,
  HAS_GOOGLE_AUTH,
  isAdminEmail,
  IS_PROD,
  CREATE_LIMIT,
  CREATE_WINDOW,
  UNLOCK_LIMIT,
  UNLOCK_WINDOW,
  type TtlKey,
} from "@/lib/config";
import { auth, signIn, signOut } from "@/auth";
import {
  ADMIN_COOKIE,
  shareCookie,
  createToken,
  verifyToken,
} from "@/lib/session";
import {
  createShare,
  verifySharePassword,
  consumeMagicLink,
  adminDeleteShare,
  rateLimit,
  type ShareMode,
} from "@/lib/shares";

const ADMIN_TTL = 60 * 60 * 8; // admin stays logged in 8h

export type ActionState = {
  error?: string;
  ok?: boolean;
  url?: string;
  expiresAt?: number;
  mode?: ShareMode;
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || (IS_PROD ? "https" : "http");
  return host ? `${proto}://${host}` : "";
}

const cookieOpts = (maxAge: number, path: string) => ({
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax" as const,
  path,
  maxAge,
});

// Admin = a valid Google session whose email is on the allowlist (production),
// or the signed password cookie (dev fallback, only when Google isn't configured).
export async function isAdmin(): Promise<boolean> {
  if (HAS_GOOGLE_AUTH) {
    const session = await auth();
    return isAdminEmail(session?.user?.email);
  }
  const jar = await cookies();
  return verifyToken("admin", jar.get(ADMIN_COOKIE)?.value);
}

// --- Admin login / logout ---------------------------------------------------

// Google (Gmail) sign-in — primary in production.
export async function loginWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/admin" });
}

// Password sign-in — dev fallback, disabled once Google auth is configured.
export async function adminLogin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (HAS_GOOGLE_AUTH) return { error: "請使用 Google 登入" };
  if (!ADMIN_PASSWORD) return { error: "伺服器尚未設定 ADMIN_PASSWORD" };
  if (!(await rateLimit(`admin:${await clientIp()}`, 8, 300)))
    return { error: "嘗試次數過多,請稍後再試" };

  const password = String(formData.get("password") || "");
  if (password !== ADMIN_PASSWORD) return { error: "密碼錯誤" };

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, createToken("admin", ADMIN_TTL), cookieOpts(ADMIN_TTL, "/"));
  redirect("/admin");
}

export async function adminLogout(): Promise<void> {
  if (HAS_GOOGLE_AUTH) {
    await signOut({ redirectTo: "/admin" });
    return;
  }
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin");
}

export async function adminDeleteAction(id: string): Promise<void> {
  if (!(await isAdmin())) return;
  await adminDeleteShare(id);
  redirect("/admin");
}

// --- Anonymous share creation -----------------------------------------------

export async function createShareAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ip = await clientIp();
  if (!(await rateLimit(`create:${ip}`, CREATE_LIMIT, CREATE_WINDOW)))
    return { error: "建立次數過多,請稍後再試" };

  try {
    const raw = String(formData.get("mode") || "link");
    const mode: ShareMode =
      raw === "password" ? "password" : raw === "magic" ? "magic" : "link";

    const { id, expiresAt, magicToken } = await createShare({
      html: String(formData.get("html") || ""),
      mode,
      password: String(formData.get("password") || ""),
      oneTime: true,
      allowExternal: formData.get("allowExternal") === "on",
      ttl: String(formData.get("ttl") || "7d") as TtlKey,
      title: String(formData.get("title") || "") || undefined,
      ip,
    });

    const base = await baseUrl();
    const url =
      mode === "magic" ? `${base}/m/${id}/${magicToken}` : `${base}/s/${id}`;
    return { ok: true, url, expiresAt, mode };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "建立失敗" };
  }
}

// --- Unlock a password share ------------------------------------------------

export async function unlockAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await rateLimit(`unlock:${id}:${await clientIp()}`, UNLOCK_LIMIT, UNLOCK_WINDOW)))
    return { error: "嘗試次數過多,請 5 分鐘後再試" };

  const password = String(formData.get("password") || "");
  const rec = await verifySharePassword(id, password);
  if (!rec) return { error: "密碼錯誤或連結已失效" };

  await setUnlockCookie(id, rec.expiresAt);
  redirect(`/s/${id}`);
}

// --- Consume a magic link ---------------------------------------------------

export async function consumeMagicAction(
  id: string,
  token: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  if (!(await rateLimit(`magic:${id}:${await clientIp()}`, 10, 300)))
    return { error: "嘗試次數過多,請稍後再試" };

  const rec = await consumeMagicLink(id, token);
  if (!rec) return { error: "連結已失效或已被使用" };

  await setUnlockCookie(id, rec.expiresAt);
  redirect(`/s/${id}`);
}

// Cookie lives on the MAIN app origin and lets the wrapper page remember the
// viewer unlocked this share (so a refresh doesn't re-prompt). The raw content
// route is authorized separately by a short-lived signed token in its URL
// (see mintRawToken), which works even when content is on a different domain.
async function setUnlockCookie(id: string, expiresAt: number): Promise<void> {
  const ttlSeconds = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  const jar = await cookies();
  jar.set(shareCookie(id), createToken(`share:${id}`, ttlSeconds), cookieOpts(ttlSeconds, `/s/${id}`));
}
