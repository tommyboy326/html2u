"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";

export default function MagicLanding({
  action,
  oneTime,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  oneTime: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {},
  );

  return (
    <main className="centered">
      <form action={formAction} className="card unlock stack">
        <h2>🔗 你收到一份分享</h2>
        {oneTime && (
          <p className="warn">
            ⚠ 這是一次性連結,開啟後即失效。請確認準備好再檢視。
          </p>
        )}
        <button type="submit" disabled={pending}>
          {pending ? "開啟中…" : "檢視內容"}
        </button>
        {state.error && <p className="error">{state.error}</p>}
      </form>
    </main>
  );
}
