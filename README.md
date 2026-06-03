# html2u

Turn **AI-generated HTML** into a shareable link — instantly.
把 **AI 產出的 HTML** 一鍵變成可分享的網頁連結。

**[English](#english) · [繁體中文](#繁體中文)** · Live: https://html2u.vercel.app

---

## English

### Why this exists

When you work with an AI (like Claude) you often end up with HTML meant *for
people to look at* — reports, slides, prototypes, data visualizations, design
mockups. Sharing it is awkward: a wall of source code is unreadable, a file
makes the other person open it themselves, a screenshot loses interactivity.

**html2u lets you paste that HTML and get a link instantly** — the recipient
opens it and sees the rendered page. Direct, what-you-see-is-what-you-get. And
because it publicly hosts other people's HTML, it ships layered security (below).

### Features

- **No sign-up**: paste HTML → get a share link.
- **Three access levels**:
  - `link` — public (anyone with the URL can view)
  - `password` — password-protected (reusable)
  - `magic` — one-time link (view once then dead, no password; consumed only on
    a click-through landing page so link-preview bots don't burn it)
- **Auto-expiry**: `1h` / `1d` / `7d` / `30d`, deleted on expiry.
- **Admin dashboard**: Google (Gmail) login restricted to an allowlist; list /
  search / flag / one-click takedown.
- **API**: programmatic creation (CLI / scripts / AI), gated by an API key.

### Security

This service publicly hosts arbitrary HTML, so the biggest threat is someone
uploading a phishing / malicious page to attack viewers, or to damage the
domain's reputation. Defense in depth:

| Risk | Defense |
|------|---------|
| Phishing page captures visitor input and **exfiltrates** it | Default CSP `connect-src 'none'` + `form-action 'none'` + only inline/`data:` resources — JS still runs, but there is **no outbound channel**, so captured data can't leave (opt-in relax for content that needs a CDN) |
| Stealing this site's cookies / session | iframe sandbox **withholds** `allow-same-origin` |
| Tab hijacking / redirect to a phishing site | sandbox withholds top-navigation, popups, downloads |
| Visual impersonation of an official page | A **non-removable warning bar** above the content (outside the iframe, the uploader can't hide it) |
| Damaging the main domain's reputation | Content can be served from a **separate origin** (`CONTENT_ORIGIN`), fully isolated from the main app |
| Unauthorized direct content fetch | `/s/<id>/raw` only accepts a short-lived signed token minted by the wrapper page |
| Mass automated creation | Creation is **per-IP rate-limited** + a **site-wide global throttle** (defeats IP-rotating botnets) + ≤ 1 MB per share; uploader IP logged, report endpoint, admin takedown |
| Free image-host / hot-linking abuse | `/s/<id>/raw` rate-limited **per IP** and **per share (global)**; over the limit returns `429` instead of re-streaming the content |
| Foreign botnet mass-creation | Optional **creation geo-restriction** (`CREATE_ALLOWED_COUNTRIES`, default Taiwan only); **viewing is unrestricted**, so links sent abroad still open |
| Search-engine indexing | Site-wide `noindex` + `robots.txt` disallow |

> Tech (CSP / sandbox) blocks data exfiltration and code attacks; the warning
> bar blocks visual fraud; a separate origin blocks reputation damage; the admin
> dashboard handles abuse that does get through.

### Self-hosting

Self-deployable. Stack: **Next.js 16 + Supabase (Postgres) + Auth.js (Google
login)**, recommended on Vercel.

#### Local development
```bash
git clone https://github.com/tommyboy326/html2u.git
cd html2u
npm install
cp .env.example .env.local      # fill in config (see .env.example)
npm run dev                     # http://localhost:3000
```
With no Supabase configured locally it falls back to a `.data/` file store; with
no Google configured the admin uses `ADMIN_PASSWORD` (both dev-only).

#### Deploy (Vercel)
1. **Supabase**: create a project → run `supabase/schema.sql` in the SQL editor →
   set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Enable `pg_cron` under
   Database → Extensions to auto-clean expired data.
2. **Google login**: create an OAuth Web client in Google Cloud, redirect URI
   `https://<your-domain>/api/auth/callback/google`; set `AUTH_GOOGLE_ID/SECRET`,
   `AUTH_SECRET`, `ADMIN_EMAILS` (comma-separated allowlist of admin Gmails).
3. **Core**: set `SESSION_SECRET` (`openssl rand -base64 32`).
4. **(Recommended) content isolation**: point a second domain at the same
   deployment and set `CONTENT_ORIGIN` + `APP_ORIGIN` so user content is fully
   isolated from the main domain.
5. **(Optional) creation geo-restriction**: set `CREATE_ALLOWED_COUNTRIES` (ISO
   country codes, comma-separated, default `TW`) to limit who can create.
   **Viewing is never restricted.** Empty = open to everyone.
6. Deploy. Home = upload page, `/admin` = dashboard.

See [`.env.example`](./.env.example) for all environment variables.

### API
Programmatic creation requires an **API key** (`ADMIN_API_KEY`); when no key is
configured the API is off (returns `503`). The web form is unaffected.
```bash
curl -X POST https://<host>/api/shares \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"link","html":"<h1>hi</h1>","ttl":"7d"}'
# mode: link (default) | password (needs "password") | magic (one-time)
# allowExternal: true relaxes the CSP to load external CDNs (weaker security)
# Key holders are trusted and bypass the creation geo-restriction.
```

### Architecture
```
app/
  page.tsx                    Home: upload form
  actions.ts                  Server Actions: create, unlock, consume magic, Google sign in/out, delete
  s/[id]/page.tsx             Viewer: gate by mode; if allowed → sandboxed iframe + warning bar
  s/[id]/raw/route.ts         Verifies token, returns HTML with strict/relaxed CSP
  m/[id]/[token]/page.tsx     One-time-link landing page
  admin/page.tsx              Dashboard: Google login + management table
  api/shares · api/report · api/auth/[...nextauth]
auth.ts                       Auth.js config (Google + ADMIN_EMAILS allowlist)
lib/  config.ts · backend.ts (Supabase/file) · shares.ts · session.ts
supabase/schema.sql           Tables + RLS + atomic RPCs + pg_cron cleanup
```

### License
MIT

---

## 繁體中文

把 **AI 產出的 HTML** 一鍵變成可分享的網頁連結,方便傳給對方看、加速溝通。

### 為什麼有這個專案

跟 AI(像 Claude)協作時,常常會產生一段「給人看」的 HTML —— 報告、簡報、原型、資料視覺化、設計稿。
要給同事或客戶看時很麻煩:貼一大段原始碼對方看不懂、丟檔案要對方自己開、截圖又失去互動。

**html2u 讓你把那段 HTML 貼上去,立刻得到一條連結**,對方點開就看到渲染好的網頁 —— 溝通直接、所見即所得。
而且因為是公開託管別人寫的 HTML,我們在安全上做了多層防護(見下)。

### 功能

- **免註冊上傳**:貼上 HTML → 取得分享連結。
- **三種存取層級**:
  - `link` 公開連結(拿到網址即可看)
  - `password` 密碼保護(可重複開啟)
  - `magic` 一次性連結(看一次即失效、免密碼;落地頁需點擊才消耗,避免被連結預覽器偷看掉)
- **自動到期**:`1h` / `1d` / `7d` / `30d`,到期自動刪除。
- **管理後台**:Google(Gmail)登入、限定指定帳號;可列出/搜尋/檢舉/一鍵下架。
- **API**:可程式化建立(給 CLI / 腳本 / AI 自動上傳),需 API 金鑰。

### 安全性

這是「公開託管任意 HTML」的服務,最大威脅是有人上傳釣魚/惡意頁面攻擊看的人,或連累網域信譽。防線(縱深):

| 風險 | 防護 |
|------|------|
| 釣魚頁竊取訪客輸入後**送出去** | 預設 CSP `connect-src 'none'` + `form-action 'none'` + 只允許 inline/`data:` 資源 —— JS 照常執行,但**沒有任何對外通道**,抓到也送不走(需要 CDN 的內容可在上傳時勾選放寬) |
| 偷取本站 cookie / session | iframe 沙箱**不給** `allow-same-origin` |
| 劫持分頁、轉址到釣魚站 | sandbox 不給 top-navigation、不給 popups/downloads |
| 假冒官方頁面的視覺詐騙 | 內容上方一條**不可移除的警語列**(在 iframe 外,上傳者無法隱藏) |
| 連累主網域信譽 | 內容可從**獨立網域**(`CONTENT_ORIGIN`)送出,與主站完全隔離 |
| 未授權直接抓內容 | `/s/<id>/raw` 僅接受外層頁簽發的短效簽章 token |
| 大量自動灌建立 | 建立端**每 IP 限流** + **全站全域節流**(擋輪換 IP 的殭屍網路)+ 單筆內容 ≤ 1MB;記錄上傳者 IP、檢舉入口、後台下架 |
| 被當免費圖床 / 熱連結盜抓 | `/s/<id>/raw` 依**每 IP**與**每連結全域**限流,超過回 `429` 而非重傳內容 |
| 境外殭屍網路灌建立 | 可選**建立地區限制**(`CREATE_ALLOWED_COUNTRIES`,預設僅台灣);**檢視不受限**,寄給國外對方的連結照常開 |
| 被搜尋引擎收錄 | 全站 `noindex` + `robots.txt` disallow |

> 技術(CSP / sandbox)擋資料外洩與程式攻擊,警語擋視覺詐騙,獨立網域擋信譽連累,後台擋已發生的濫用。

### 個人自架

本專案可自行部署。技術棧:**Next.js 16 + Supabase(Postgres)+ Auth.js(Google 登入)**,推薦部署到 Vercel。

#### 本機開發
```bash
git clone https://github.com/tommyboy326/html2u.git
cd html2u
npm install
cp .env.example .env.local      # 填入設定(見下)
npm run dev                     # http://localhost:3000
```
本機未設 Supabase 時自動用 `.data/` 檔案儲存;未設 Google 時後台用 `ADMIN_PASSWORD`(皆僅供開發)。

#### 部署(Vercel)
1. **Supabase**:建專案 → SQL editor 跑 `supabase/schema.sql` → 設 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。
   Database → Extensions 開 `pg_cron`,並取消 `schema.sql` 末段註解以自動清過期資料。
2. **Google 登入**:Google Cloud 建 OAuth Web client,redirect URI 設
   `https://<你的網域>/api/auth/callback/google`,填 `AUTH_GOOGLE_ID/SECRET`、`AUTH_SECRET`、
   `ADMIN_EMAILS`(允許登入後台的 Gmail,逗號分隔)。
3. **核心**:設 `SESSION_SECRET`(`openssl rand -base64 32`)。
4. **(建議)內容隔離**:準備第二個網域指向同一部署,設 `CONTENT_ORIGIN` 與 `APP_ORIGIN`,
   讓使用者內容與主網域完全隔離。
5. **(選用)建立地區限制**:設 `CREATE_ALLOWED_COUNTRIES`(ISO 國碼,逗號分隔,預設 `TW`)
   限制可建立分享的來源國家;**檢視不受限**,寄給國外對方的連結照常開得了。留空 = 開放全球。
6. 部署。首頁=上傳頁,`/admin`=管理後台。

完整環境變數說明見 [`.env.example`](./.env.example)。

### API 範例
程式化建立需帶 **API 金鑰**(`ADMIN_API_KEY`);未設定金鑰時 API 關閉(回 `503`),網頁表單不受影響。
```bash
curl -X POST https://<host>/api/shares \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"link","html":"<h1>hi</h1>","ttl":"7d"}'
# mode: link(預設) | password(需 password) | magic(一次性)
# allowExternal: true 可放寬 CSP 以載入外部 CDN(安全性降低)
# 帶金鑰的呼叫視為信任來源,不受「建立地區限制」約束。
```

### 架構
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

### 授權
MIT
