import { headers } from "next/headers";
import {
  IS_PROD,
  CREATE_LIMIT,
  CREATE_WINDOW,
  CREATE_GLOBAL_LIMIT,
  CREATE_GLOBAL_WINDOW,
  HAS_API_KEY,
  type TtlKey,
} from "@/lib/config";
import { verifyApiKey } from "@/lib/session";
import { createShare, rateLimit, type ShareMode } from "@/lib/shares";

export const dynamic = "force-dynamic";

// Programmatic share creation (CLI / scripts / Claude). Requires an API key:
//
//   curl -X POST https://<host>/api/shares \
//     -H "Authorization: Bearer $ADMIN_API_KEY" \
//     -H "Content-Type: application/json" \
//     -d '{"mode":"link","html":"<h1>hi</h1>","ttl":"7d"}'
//
//   mode: "link" (default) | "password" (needs "password") | "magic" (one-time link)
//   allowExternal: true to permit external CDNs/resources (weaker CSP; default false)
//   banner: false to hide the anti-phishing safety banner (trusted content only;
//           default true — the anonymous web form cannot turn it off)
//
// The key holder is trusted, so the geo restriction is skipped here (so you can
// call from a CI box or abroad); the anonymous web form keeps the geo gate. Rate
// limits stay as a key-leak backstop. When ADMIN_API_KEY is unset the API is off.
export async function POST(req: Request) {
  const h = await headers();

  if (!HAS_API_KEY)
    return Response.json({ error: "API disabled" }, { status: 503 });
  const authz = h.get("authorization");
  const key = authz?.startsWith("Bearer ")
    ? authz.slice(7)
    : h.get("x-api-key");
  if (!verifyApiKey(key))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`create:${ip}`, CREATE_LIMIT, CREATE_WINDOW)))
    return Response.json({ error: "rate limited" }, { status: 429 });
  if (!(await rateLimit("create:global", CREATE_GLOBAL_LIMIT, CREATE_GLOBAL_WINDOW)))
    return Response.json({ error: "rate limited" }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON 格式錯誤" }, { status: 400 });
  }

  try {
    const raw = body.mode;
    const mode: ShareMode =
      raw === "password" ? "password" : raw === "magic" ? "magic" : "link";

    const { id, expiresAt, magicToken } = await createShare({
      html: String(body.html ?? ""),
      mode,
      password: String(body.password ?? ""),
      oneTime: body.oneTime !== false,
      allowExternal: body.allowExternal === true,
      showBanner: body.banner !== false,
      ttl: (typeof body.ttl === "string" ? body.ttl : "7d") as TtlKey,
      title: body.title ? String(body.title) : undefined,
      ip,
    });

    const host = h.get("x-forwarded-host") || h.get("host");
    const proto = h.get("x-forwarded-proto") || (IS_PROD ? "https" : "http");
    const base = host ? `${proto}://${host}` : "";
    const url = mode === "magic" ? `${base}/m/${id}/${magicToken}` : `${base}/s/${id}`;
    return Response.json({ id, mode, url, expiresAt }, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "建立失敗" },
      { status: 400 },
    );
  }
}
