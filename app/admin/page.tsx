import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyToken } from "@/lib/session";
import { ADMIN_PASSWORD, HAS_GOOGLE_AUTH, isAdminEmail } from "@/lib/config";
import { auth } from "@/auth";
import { listShares } from "@/lib/shares";
import { adminLogout, adminDeleteAction, loginWithGoogle } from "@/app/actions";
import AdminLogin from "@/app/_components/AdminLogin";

export const dynamic = "force-dynamic";

async function isAdmin(): Promise<boolean> {
  if (HAS_GOOGLE_AUTH) {
    const session = await auth();
    return isAdminEmail(session?.user?.email);
  }
  const jar = await cookies();
  return verifyToken("admin", jar.get(ADMIN_COOKIE)?.value);
}

const PAGE_SIZE = 50;

const MODE_LABEL: Record<string, string> = {
  link: "公開連結",
  password: "密碼",
  magic: "一次性",
};

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; error?: string }>;
}) {
  const sp = await searchParams;

  if (!(await isAdmin())) {
    return (
      <main className="container">
        <header className="stack" style={{ marginBottom: 24 }}>
          <h1>🛡 管理後台</h1>
        </header>
        {HAS_GOOGLE_AUTH ? (
          <form
            action={loginWithGoogle}
            className="card stack"
            style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}
          >
            <h2>管理登入</h2>
            <p className="muted">僅限授權的 Google 帳號可進入。</p>
            {sp.error && (
              <p className="error">
                此 Google 帳號未獲授權,或登入失敗。
              </p>
            )}
            <button type="submit">使用 Google 登入</button>
          </form>
        ) : (
          <AdminLogin configured={!!ADMIN_PASSWORD} />
        )}
      </main>
    );
  }

  const q = (sp.q || "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { items, total } = await listShares({ limit: PAGE_SIZE, offset, q: q || undefined });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="container wide">
      <div className="rowbetween" style={{ marginBottom: 16 }}>
        <h1>🛡 管理後台</h1>
        <form action={adminLogout}>
          <button className="link" type="submit">登出</button>
        </form>
      </div>

      <form className="row" style={{ marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="以標題搜尋…" style={{ flex: 1 }} />
        <button type="submit">搜尋</button>
      </form>

      <p className="muted">共 {total} 筆{q && `(搜尋:「${q}」)`}</p>

      <div className="tablewrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>連結</th>
              <th>標題</th>
              <th>層級</th>
              <th>外部</th>
              <th>瀏覽</th>
              <th>檢舉</th>
              <th>上傳 IP</th>
              <th>到期</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  沒有資料
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className={s.reports > 0 ? "flagged" : undefined}>
                <td>
                  <a href={`/s/${s.id}`} target="_blank" rel="noreferrer">
                    /s/{s.id.slice(0, 8)}…
                  </a>
                </td>
                <td>{s.title || <span className="muted">—</span>}</td>
                <td>
                  {MODE_LABEL[s.mode] || s.mode}
                  {s.mode === "magic" && s.consumedAt ? "(已用)" : ""}
                </td>
                <td>{s.allowExternal ? "⚠ 是" : "否"}</td>
                <td>{s.views}</td>
                <td className={s.reports > 0 ? "error" : undefined}>{s.reports}</td>
                <td className="muted small">{s.createdIp || "—"}</td>
                <td className="muted small">{fmt(s.expiresAt)}</td>
                <td>
                  <form action={adminDeleteAction.bind(null, s.id)}>
                    <button className="danger" type="submit">刪除</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="row" style={{ marginTop: 16, justifyContent: "center" }}>
          {page > 1 && (
            <a className="pagelink" href={`/admin?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
              ← 上一頁
            </a>
          )}
          <span className="muted">
            第 {page} / {pages} 頁
          </span>
          {page < pages && (
            <a className="pagelink" href={`/admin?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
              下一頁 →
            </a>
          )}
        </div>
      )}
    </main>
  );
}
