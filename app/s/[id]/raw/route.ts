import { verifyToken } from "@/lib/session";
import {
  APP_ORIGIN,
  VIEW_LIMIT_PER_IP,
  VIEW_LIMIT_PER_SHARE,
  VIEW_WINDOW,
} from "@/lib/config";
import { getShare, recordView, rateLimit } from "@/lib/shares";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

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

  // Abuse guard. Only token-authorized requests reach here (the token is minted
  // by the wrapper page), so a stranger cannot poison a victim's limit. The
  // per-share cap (across all IPs) is the real defense against distributed
  // hot-linking — the same link fetched from many regions to use this as a free
  // image host. Over the limit => a tiny 429 instead of re-streaming the HTML,
  // which is what was burning Vercel origin transfer.
  const ip = clientIp(req);
  const [okIp, okShare] = await Promise.all([
    rateLimit(`view:${id}:${ip}`, VIEW_LIMIT_PER_IP, VIEW_WINDOW),
    rateLimit(`view:${id}`, VIEW_LIMIT_PER_SHARE, VIEW_WINDOW),
  ]);
  if (!okIp || !okShare) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(VIEW_WINDOW), "Cache-Control": "no-store" },
    });
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
