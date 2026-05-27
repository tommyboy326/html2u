import { verifyToken } from "@/lib/session";
import { APP_ORIGIN } from "@/lib/config";
import { getShare, recordView } from "@/lib/shares";

export const dynamic = "force-dynamic";

// Serves the raw shared HTML. Authorized by a short-lived signed token minted by
// the wrapper page (?t=...) — which only renders the iframe after deciding the
// viewer is allowed. This works even when content is served from a separate
// CONTENT_ORIGIN domain (cookies wouldn't cross domains; signed tokens do).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") || undefined;

  if (!verifyToken(`raw:${id}`, token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rec = await getShare(id);
  if (!rec) return new Response("Not found", { status: 404 });

  // Best-effort view count (don't block the response on it).
  recordView(id).catch(() => {});

  // Only our wrapper (app origin) may frame this content.
  const frameAncestors = APP_ORIGIN || "'self'";

  return new Response(rec.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Content-Security-Policy": buildCsp(rec.allowExternal, frameAncestors),
    },
  });
}

// Strict (default): JS runs, but ALL outbound channels are blocked — no fetch/
// XHR/beacon, no form submission, only inline + data: resources. A phishing page
// can capture input but cannot send it anywhere. Permissive (opt-in): allows
// external resources for content that needs CDNs — weaker, risk accepted.
function buildCsp(allowExternal: boolean, frameAncestors: string): string {
  if (allowExternal) {
    return `frame-ancestors ${frameAncestors}; base-uri 'none'`;
  }
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}
