"use client";

import { useState } from "react";

// Rendered by the wrapper page, OUTSIDE the sandboxed iframe — the uploaded
// HTML cannot remove or cover it. This is the anti-phishing guardrail.
//
// Visual treatment: Liquid Glass frosted chrome (warm amber) sitting above
// user content, per macOS 26 spec — backdrop-filter blur + saturation, with a
// prefers-reduced-transparency fallback (handled in globals.css).
export default function SafetyBanner({ id }: { id: string }) {
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  async function report() {
    if (busy || reported) return;
    setBusy(true);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setReported(true);
    } catch {
      /* best effort */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="safety-banner" role="alert">
      <span className="safety-text">
        ⚠️ 此為使用者上傳的展示內容,<b>並非官方頁面</b> —— 切勿輸入帳號、密碼或個資,也請勿進行任何與你帳號相關的操作。
      </span>
      <button
        className="report-btn"
        onClick={report}
        disabled={busy || reported}
        type="button"
      >
        {reported ? "已檢舉 ✓" : "檢舉此頁"}
      </button>
    </div>
  );
}
