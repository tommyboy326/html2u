"use client";

import { useActionState } from "react";
import { adminLogin, type ActionState } from "@/app/actions";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    adminLogin,
    {},
  );

  return (
    <form action={action} className="card stack" style={{ maxWidth: 380, margin: "0 auto" }}>
      <h2>管理登入</h2>
      <p className="muted">輸入管理密碼以建立分享連結。</p>
      {!configured && (
        <p className="warn">⚠ 伺服器尚未設定 ADMIN_PASSWORD,請見 README。</p>
      )}
      <input name="password" type="password" placeholder="管理密碼" autoFocus />
      <button disabled={pending}>{pending ? "登入中…" : "登入"}</button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
