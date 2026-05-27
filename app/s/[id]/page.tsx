import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { shareCookie, verifyToken, createToken } from "@/lib/session";
import { CONTENT_ORIGIN } from "@/lib/config";
import { getShare } from "@/lib/shares";
import { unlockAction } from "@/app/actions";
import PasswordForm from "@/app/_components/PasswordForm";
import SafetyBanner from "@/app/_components/SafetyBanner";

export const dynamic = "force-dynamic";

const RAW_TOKEN_TTL = 300; // iframe must load within 5 minutes of grant

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rec = await getShare(id);
  if (!rec) notFound();

  const jar = await cookies();
  const hasCookie = verifyToken(`share:${id}`, jar.get(shareCookie(id))?.value);

  // Decide whether this viewer may see the content.
  //   - link:     the unguessable URL is the gate → always allowed
  //   - password: needs the unlock cookie → else show password form
  //   - magic:    needs the unlock cookie (set after consuming the link)
  let allowed = false;
  if (rec.mode === "link") allowed = true;
  else if (hasCookie) allowed = true;

  if (!allowed) {
    if (rec.mode === "password") {
      return <PasswordForm action={unlockAction.bind(null, id)} />;
    }
    return (
      <main className="centered">
        <div className="card unlock stack">
          <h1>🔒 受保護的內容</h1>
          <p className="muted">請使用你收到的專屬連結開啟此內容。</p>
        </div>
      </main>
    );
  }

  // Authorized → render the creator's HTML in a sandboxed iframe. The raw route
  // is authorized by this short-lived signed token (works cross-domain too).
  // The safety banner lives OUTSIDE the iframe, so the uploaded HTML can never
  // hide or alter it.
  const rawToken = createToken(`raw:${id}`, RAW_TOKEN_TTL);
  const src = `${CONTENT_ORIGIN}/s/${id}/raw?t=${rawToken}`;

  return (
    <div className="viewer">
      <SafetyBanner id={id} />
      <iframe
        title="shared content"
        className="content-frame"
        src={src}
        // No allow-same-origin (can't touch our origin), no top-navigation
        // (can't hijack the tab), no popups/downloads (can't push files / open
        // external tabs). Scripts + forms only.
        sandbox="allow-scripts allow-forms"
      />
    </div>
  );
}
