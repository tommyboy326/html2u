"use client";

import { useActionState, useRef, useState } from "react";
import { createShareAction, type ActionState } from "@/app/actions";

// Must match MAX_HTML_BYTES on the server (lib/config.ts) so we fail-fast
// in the browser instead of waiting for the round-trip.
const MAX_BYTES = 2 * 1024 * 1024;

// Small inline upload glyph — DESIGN.md voice: quiet outline, no decoration.
function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 1v10M3 6l5-5 5 5M2 14h12" />
    </svg>
  );
}

export default function CreateForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createShareAction,
    {},
  );
  const [mode, setMode] = useState<"link" | "password" | "magic">("link");
  const [copied, setCopied] = useState(false);

  // HTML body is now a controlled value so file drops / picks can populate it.
  const [html, setHtml] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadFile(file: File) {
    setFileError(null);
    const looksHtml =
      file.type === "text/html" ||
      file.type === "" ||
      /\.html?$/i.test(file.name);
    if (!looksHtml) {
      setFileError("只接受 .html / .htm 檔案");
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("檔案過大,上限 2MB");
      return;
    }
    try {
      const text = await file.text();
      setHtml(text);
    } catch {
      setFileError("讀取檔案失敗");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = ""; // allow re-selecting the same file later
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  }
  function onDragLeave() {
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }

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
    <div className="stack" style={{ gap: 24 }}>
      <form action={action} className="card stack">
        <label>
          標題(選填,僅自己/管理者看得到)
          <input name="title" placeholder="給自己辨識用" />
        </label>

        {/* HTML field: title row on top with upload action, dropzone below */}
        <div className="stack-sm">
          <div className="rowbetween" style={{ alignItems: "baseline" }}>
            <span className="field-label">HTML 內容</span>
            <span style={{ display: "flex", gap: 12 }}>
              {html && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setHtml("");
                    setFileError(null);
                  }}
                >
                  清除
                </button>
              )}
              <button
                type="button"
                className="link"
                onClick={() => fileInputRef.current?.click()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <UploadIcon /> 上傳 .html 檔
              </button>
            </span>
          </div>

          <div
            className={`dropzone${dragOver ? " drag-active" : ""}`}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <textarea
              name="html"
              rows={14}
              placeholder="貼上要分享的 HTML — 或把 .html 檔案直接拖進來"
              spellCheck={false}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
            />
            {dragOver && (
              <div className="dropzone-overlay">
                <UploadIcon />
                放開即上傳
              </div>
            )}
          </div>

          {fileError && <p className="error">{fileError}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,text/html"
            onChange={onPick}
            style={{ display: "none" }}
          />
        </div>

        <label>
          存取層級
          <select
            name="mode"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "link" | "password" | "magic")
            }
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
              任何拿到網址的人都能檢視 —— 網址即門票(21 字元亂數,無法猜測)。
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

        <div>
          <button type="submit" disabled={pending}>
            {pending ? "建立中…" : "建立分享連結"}
          </button>
          {state.error && (
            <p className="error" style={{ marginTop: 12 }}>{state.error}</p>
          )}
        </div>
      </form>

      {state.ok && state.url && (
        <div className="card success stack">
          <h3>
            {state.mode === "magic"
              ? "✓ 一次性連結已建立"
              : state.mode === "password"
              ? "✓ 已建立(把連結與密碼分別給對方)"
              : "✓ 已建立 — 把連結給對方即可"}
          </h3>
          <div className="row">
            <input
              readOnly
              value={state.url}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1 }}
            />
            <button type="button" className="primary" onClick={() => copy(state.url!)}>
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
