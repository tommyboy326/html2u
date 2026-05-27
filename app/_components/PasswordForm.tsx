"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";

export default function PasswordForm({
  action,
}: {
  // unlockAction with the share id already bound in the server component
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  return (
    <main className="centered">
      <form action={formAction} className="card stack unlock">
        <h1>🔒 受保護的內容</h1>
        <p className="muted">請輸入對方提供的密碼以檢視。</p>
        <input name="password" type="password" placeholder="密碼" autoFocus />
        <button disabled={pending}>{pending ? "驗證中…" : "解鎖檢視"}</button>
        {state.error && <p className="error">{state.error}</p>}
      </form>
    </main>
  );
}
