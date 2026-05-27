import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { shareCookie, verifyToken } from "@/lib/session";
import { getMagicShare } from "@/lib/shares";
import { consumeMagicAction } from "@/app/actions";
import MagicLanding from "@/app/_components/MagicLanding";

export const dynamic = "force-dynamic";

export default async function MagicPage({
  params,
}: {
  params: Promise<{ id: string; token: string }>;
}) {
  const { id, token } = await params;

  const rec = await getMagicShare(id, token);
  if (!rec) notFound(); // wrong/expired token reveals nothing

  // This browser already unlocked it (e.g. revisiting from history) → content.
  const jar = await cookies();
  if (verifyToken(`share:${id}`, jar.get(shareCookie(id))?.value)) {
    redirect(`/s/${id}`);
  }

  // One-time link already used by someone else → dead end.
  if (rec.oneTime && rec.consumedAt) {
    return (
      <main className="centered">
        <div className="card unlock stack">
          <h1>🔒 連結已失效</h1>
          <p className="muted">這是一次性連結,已經被使用過了。</p>
        </div>
      </main>
    );
  }

  // Require an explicit click so link-scanners / previewers don't consume it.
  return (
    <MagicLanding action={consumeMagicAction.bind(null, id, token)} oneTime={!!rec.oneTime} />
  );
}
