import { headers } from "next/headers";
import { REPORT_LIMIT, REPORT_WINDOW } from "@/lib/config";
import { reportShare, rateLimit } from "@/lib/shares";

export const dynamic = "force-dynamic";

// Anonymous abuse report — increments a counter the admin dashboard sorts by.
export async function POST(req: Request) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`report:${ip}`, REPORT_LIMIT, REPORT_WINDOW)))
    return Response.json({ error: "rate limited" }, { status: 429 });

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  await reportShare(id);
  return Response.json({ ok: true });
}
