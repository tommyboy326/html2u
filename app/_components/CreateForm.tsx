"use client";

import { useActionState, useState } from "react";
import { createShareAction, type ActionState } from "@/app/actions";

export default function CreateForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createShareAction,
    {},
  );
  const [mode, setMode] = useState<"link" | "password" | "magic">("link");
  const [copied, setCopied] = useState(false);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  return (
    <div className="stack">
      <form action={action} className="card stack">
        <label>
          標題(選填,僅自己/管理者看得到)
          <input name="title" placeholder="給自己辨識用" />
        </label>

        <label>
          HTML 內容
          <textarea
            name="html"
            rows={14}
            placeholder="貼上要分享的 HTML…"
            spellCheck={false}
          />
        </label>

        <label>
          存取層級
          <select
            name="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as "link" | "password" | "magic")}
          >
            <option value="link">公開連結(拿到網址即可看,免密碼)</option>
            <option value="password">密碼保護(可重複開啟)</option>
            <option value="magic">一次性連結(看一次即失效,免密碼)</option>
          </select>
        </label>

        <div className="row">
          {mode === "password" ? (
            <label style={{ flex: 1 }}>
              檢視密碼(給對方)
              <input name="password" type="text" placeholder="至少 4 個字元" />
            </label>
          ) : mode === "magic" ? (
            <p className="muted" style={{ flex: 1 }}>
              產生一條專屬連結,對方點開檢視一次後即失效。
              <br />⚠ 拿到連結後請勿自己先點開,否則就被用掉了。
            </p>
          ) : (
            <p className="muted" style={{ flex: 1 }}>
              任何拿到網址的人都能檢視 —— 網址本身就是門票(21 字元亂數,無法猜測)。
            </p>
          )}
          <label>
            有效期限
            <select name="ttl" defaultValue="7d">
              <option value="1h">1 小時</option>
              <option value="1d">1 天</option>
              <option value="7d">7 天</option>
              <option value="30d">30 天</option>
            </select>
          </label>
        </div>

        <label className="checkbox">
          <input type="checkbox" name="allowExternal" />
          <span>
            允許載入外部資源(CDN、外部圖片/腳本)
            <br />
            <span className="muted">
              預設為最安全模式:JS 照常執行,但封鎖所有對外傳輸(防止頁面竊取訪客輸入)。
              只有內容需要外部 CDN 時才勾選 —— 會放寬限制,安全性降低。
            </span>
          </span>
        </label>

        <button disabled={pending}>{pending ? "建立中…" : "建立分享連結"}</button>
        {state.error && <p className="error">{state.error}</p>}
      </form>

      {state.ok && state.url && (
        <div className="card stack success">
          {state.mode === "magic" ? (
            <p>✅ 一次性連結已建立,直接把這條連結給對方(免密碼):</p>
          ) : state.mode === "password" ? (
            <p>✅ 已建立!把「連結」和「密碼」分別給對方:</p>
          ) : (
            <p>✅ 已建立!把這條連結給對方即可:</p>
          )}
          <div className="row">
            <input
              readOnly
              value={state.url}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => copy(state.url!)}>
              {copied ? "已複製" : "複製連結"}
            </button>
          </div>
          {state.expiresAt && (
            <p className="muted">
              到期時間:{new Date(state.expiresAt).toLocaleString()}(到期後自動刪除)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
