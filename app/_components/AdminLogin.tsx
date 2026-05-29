"use client";

import { useActionState } from "react";
import { adminLogin, type ActionState } from "@/app/actions";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    adminLogin,
    {},
  );

  return (
    <form action={action} className="card unlock stack">
      <h2>管理登入</h2>
      <p className="muted">輸入管理密碼以進入後台。</p>
      {!configured && (
        <p className="warn">⚠ 伺服器尚未設定 ADMIN_PASSWORD,請見 README。</p>
      )}
      <input name="password" type="password" placeholder="管理密碼" autoFocus />
      <button type="submit" disabled={pending}>
        {pending ? "登入中…" : "登入"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
