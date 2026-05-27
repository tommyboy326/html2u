import { headers } from "next/headers";
import { IS_PROD, CREATE_LIMIT, CREATE_WINDOW, type TtlKey } from "@/lib/config";
import { createShare, rateLimit, type ShareMode } from "@/lib/shares";

export const dynamic = "force-dynamic";

// Anonymous programmatic share creation (CLI / scripts / Claude). Rate-limited
// per IP. For stronger protection put this behind Vercel BotID / a WAF rule.
//
//   curl -X POST https://<host>/api/shares -H "Content-Type: application/json" \
//     -d '{"mode":"link","html":"<h1>hi</h1>","ttl":"7d"}'
//
//   mode: "link" (default) | "password" (needs "password") | "magic" (one-time link)
//   allowExternal: true to permit external CDNs/resources (weaker CSP; default false)
export async function POST(req: Request) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`create:${ip}`, CREATE_LIMIT, CREATE_WINDOW)))
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
