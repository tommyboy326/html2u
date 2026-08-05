<!-- flightwake TRAPS — 坑 registry。非顯而易見、會再咬人的事實。 -->
<!-- 條目採 OKF 式慣例:frontmatter 區塊 + 內文;可用 [[名稱]] 互連。新的加最上面。 -->
<!-- 時效:條目過時(功能合併/重構後不再成立)不刪 — status 改 superseded 並指向取代者;讀的人只信 active。 -->

# 坑 Registry

---
name: vercel-env-all-sensitive-unreadable
type: constraint
status: active
tags: [vercel, secrets, prod]
discovered: 2026-08-05
---

**症狀**:`vercel env pull` 拉回來的專案變數全是空字串;dashboard 也看不到值
**根因**:html2u 專案的環境變數全部建立為 Sensitive(write-only),任何管道都讀不回來
**解法/繞法**:忘了值就只能輪替(`vercel env rm` + `vercel env add` + redeploy);
新值同步寫進本機 `.env.local`。另注意本機 vercel CLI 有多帳號,預設登入的帳號下有
同名空殼專案——操作前先 `vercel whoami`
**佐證**:[[records/260805-mcp-share-html.md]]

---
name: dual-state-md-gsd-vs-flightwake
type: gotcha
status: active
tags: [tooling, gsd, flightwake]
discovered: 2026-08-05
---

**症狀**:repo 裡有兩個 STATE.md,內容看起來都在講「專案進度」,容易讀錯邊或改錯邊
**根因**:GSD(`.planning/STATE.md`,milestone 規劃追蹤)與 flightwake
(`.flightwake/STATE.md`,session 交接)各自維護一份;且 GSD 那份可能落後現況
(ad-hoc commits 不經 GSD 流程)
**解法/繞法**:冷啟動只信 `.flightwake/STATE.md`;進 GSD 流程前先確認
`.planning/STATE.md` 是否對齊 git 現況
**佐證**:[[records/260805-flightwake-init.md]]

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(過時不刪,改此欄並在內文指向 [[取代條目]] 或 record)
tags: [{{標籤}}]
discovered: {{YYYY-MM-DD}}
---

**症狀**:{{看到什麼(錯誤訊息/怪行為)}}
**根因**:{{一句話}}
**解法/繞法**:{{怎麼處理}}
**佐證**:{{commit/record 連結}}
