# html2u

把 **AI 產出的 HTML** 一鍵變成可分享的網頁連結,方便傳給對方看、加速溝通。

## 為什麼有這個專案

跟 AI(像 Claude)協作時,常常會產生一段「給人看」的 HTML —— 報告、簡報、原型、資料視覺化、設計稿。
要給同事或客戶看時很麻煩:貼一大段原始碼對方看不懂、丟檔案要對方自己開、截圖又失去互動。

**html2u 讓你把那段 HTML 貼上去,立刻得到一條連結**,對方點開就看到渲染好的網頁 —— 溝通直接、所見即所得。
而且因為是公開託管別人寫的 HTML,我們在安全上做了多層防護(見下)。

## 功能

- **免註冊上傳**:貼上 HTML → 取得分享連結。
- **三種存取層級**:
  - `link` 公開連結(拿到網址即可看)
  - `password` 密碼保護(可重複開啟)
  - `magic` 一次性連結(看一次即失效、免密碼;落地頁需點擊才消耗,避免被連結預覽器偷看掉)
- **自動到期**:`1h` / `1d` / `7d` / `30d`,到期自動刪除。
- **管理後台**:Google(Gmail)登入、限定指定帳號;可列出/搜尋/檢舉/一鍵下架。
- **API**:可程式化建立(給 CLI / 腳本 / AI 自動上傳)。

## 安全性

這是「公開託管任意 HTML」的服務,最大威脅是有人上傳釣魚/惡意頁面攻擊看的人,或連累網域信譽。防線(縱深):

| 風險 | 防護 |
|------|------|
| 釣魚頁竊取訪客輸入後**送出去** | 預設 CSP `connect-src 'none'` + `form-action 'none'` + 只允許 inline/`data:` 資源 —— JS 照常執行,但**沒有任何對外通道**,抓到也送不走(需要 CDN 的內容可在上傳時勾選放寬) |
| 偷取本站 cookie / session | iframe 沙箱**不給** `allow-same-origin` |
| 劫持分頁、轉址到釣魚站 | sandbox 不給 top-navigation、不給 popups/downloads |
| 假冒官方頁面的視覺詐騙 | 內容上方一條**不可移除的警語列**(在 iframe 外,上傳者無法隱藏) |
| 連累主網域信譽 | 內容可從**獨立網域**(`CONTENT_ORIGIN`)送出,與主站完全隔離 |
| 未授權直接抓內容 | `/s/<id>/raw` 僅接受外層頁簽發的短效簽章 token |
| 大量自動上傳 | 每 IP 限流、記錄上傳者 IP、檢舉入口、後台下架 |
| 被搜尋引擎收錄 | 全站 `noindex` + `robots.txt` disallow |

> 技術(CSP / sandbox)擋資料外洩與程式攻擊,警語擋視覺詐騙,獨立網域擋信譽連累,後台擋已發生的濫用。

## 個人自架

本專案可自行部署。技術棧:**Next.js 16 + Supabase(Postgres)+ Auth.js(Google 登入)**,推薦部署到 Vercel。

### 本機開發
```bash
git clone https://github.com/tommyboy326/html2u.git
cd html2u
npm install
cp .env.example .env.local      # 填入設定(見下)
npm run dev                     # http://localhost:3000
```
本機未設 Supabase 時自動用 `.data/` 檔案儲存;未設 Google 時後台用 `ADMIN_PASSWORD`(皆僅供開發)。

### 部署(Vercel)
1. **Supabase**:建專案 → SQL editor 跑 `supabase/schema.sql` → 設 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。
   Database → Extensions 開 `pg_cron`,並取消 `schema.sql` 末段註解以自動清過期資料。
2. **Google 登入**:Google Cloud 建 OAuth Web client,redirect URI 設
   `https://<你的網域>/api/auth/callback/google`,填 `AUTH_GOOGLE_ID/SECRET`、`AUTH_SECRET`、
   `ADMIN_EMAILS`(允許登入後台的 Gmail,逗號分隔)。
3. **核心**:設 `SESSION_SECRET`(`openssl rand -base64 32`)。
4. **(建議)內容隔離**:準備第二個網域指向同一部署,設 `CONTENT_ORIGIN` 與 `APP_ORIGIN`,
   讓使用者內容與主網域完全隔離。
5. 部署。首頁=上傳頁,`/admin`=管理後台。

完整環境變數說明見 [`.env.example`](./.env.example)。

### API 範例
```bash
curl -X POST https://<host>/api/shares -H "Content-Type: application/json" \
  -d '{"mode":"link","html":"<h1>hi</h1>","ttl":"7d"}'
# mode: link(預設) | password(需 password) | magic(一次性)
# allowExternal: true 可放寬 CSP 以載入外部 CDN(安全性降低)
```

## 架構
```
app/
  page.tsx                    首頁:上傳表單
  actions.ts                  Server Actions:建立、解鎖、消耗 magic、Google 登入/出、刪除
  s/[id]/page.tsx             檢視頁:依 mode 決定門檻;通過→沙箱 iframe + 警語列
  s/[id]/raw/route.ts         token 驗證後吐 HTML,套用嚴格/放寬 CSP
  m/[id]/[token]/page.tsx     一次性連結落地頁
  admin/page.tsx              後台:Google 登入 + 管理表格
  api/shares · api/report · api/auth/[...nextauth]
auth.ts                       Auth.js 設定(Google + ADMIN_EMAILS 允許清單)
lib/  config.ts · backend.ts(Supabase/檔案)· shares.ts · session.ts
supabase/schema.sql           資料表 + RLS + 原子 RPC + pg_cron 清理
```

## 授權
MIT
