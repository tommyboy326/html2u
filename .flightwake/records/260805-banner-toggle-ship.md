---
record_id: 260805-banner-toggle-ship
session: claude-code (kaiwu)
date: 2026-08-05
repos: [html2u]
tests: tsc clean / next build 通過 / 本地 E2E(FileBackend)+ prod E2E 通過
prod_changes: PR #1 merge 部署;shares 表加 show_banner 欄位;短暫事故(見下)
---

# 警示 bar 三層政策上線(PR #1)+ 一次 schema 快取事故

**TL;DR**:防釣魚警示 bar 從「一律顯示」改為三層政策——匿名表單強制顯示、
API key 建立者可關(MCP 預設關)、admin 逐筆開關。PR #1 merge 上線。
過程中 prod「建立分享」壞了約 20 分鐘:migration 其實沒套進 app 連的資料庫,
merge 後新 code 的 insert 全數失敗;補跑 ALTER + 重啟後恢復並完整驗收。

## 關鍵發現(重要性排序)

1. **「migration 跑好了」要用查詢驗證,不能只聽宣稱**:使用者回報已套用
   show_banner 欄位,但 `information_schema.columns` 查出 count=0——實際沒進到
   app 連的那個資料庫。教訓:schema 前置步驟完成後,先跑一句
   `select count(*) from information_schema.columns where …` 拿到證據再 merge。
2. **部署窗口的暖 function 會給假陰性/假陽性**:merge 後第一發 probe「成功」,
   其實是打到還沒換版的舊 serverless function(舊 insert 不帶新欄位所以能過),
   讓人誤以為 migration 生效。驗證要連發多次、且要檢查 create 回應本身,
   不能只看最終頁面 grep 數。
3. Supabase DDL 之後 PostgREST schema cache 需要 `NOTIFY pgrst, 'reload schema';`
   或重啟專案才可靠重載。已登進 TRAPS(連同「多 Supabase/Vercel 帳號」情境)。

## 交付 / Commits

PR #1(merge commit 見 git);功能細節 commit 訊息已載明。
另:MCP user-scope 註冊已改指穩定 clone `~/orca/html2u`(`~/.claude.json`),
`.env.local`(含 ADMIN_API_KEY)已複製到穩定 clone。

## 驗證證據

- 本地(FileBackend + dev server):`banner:false` 頁 safety-banner 0 個、
  預設 1 個;admin 後台實點切換「顯示中↔已隱藏」雙向生效(瀏覽器實測)
- prod(修復後):預設 share → banner-count 1;`banner:false` → 0;
  穩定 clone 路徑的 MCP 直達 prod 建立成功
- 事故範圍:僅「建立」失敗約 20 分鐘(04:58 merge ~ 修復),既有分享瀏覽不受影響

## 未完 / 交接

- 無。Phase 2(i18n)為下一件事,入口見 STATE。
