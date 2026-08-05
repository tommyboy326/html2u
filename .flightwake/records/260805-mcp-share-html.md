---
record_id: 260805-mcp-share-html
session: claude-code (kaiwu)
date: 2026-08-05
repos: [html2u/piranha]
tests: MCP 協定煙霧測試 + prod 端到端驗收通過(未跑 tsc——本次未動 app code)
prod_changes: ADMIN_API_KEY 輪替(Vercel production + preview)+ redeploy
---

# Claude Code ↔ html2u 串接:MCP server 上線 + prod API key 輪替

**TL;DR**:做了一個零依賴的 MCP server(`mcp/html2u-mcp.mjs`)包住既有的
`POST /api/shares`,註冊到 Claude Code user scope 後,任何 session 都能把 HTML
直接變成 html2u 分享連結。過程中發現 prod 的 ADMIN_API_KEY 讀不回來(Vercel
Sensitive 變數),於是輪替了一把新 key。端到端驗收通過。

## 關鍵發現(重要性排序)

1. **這個 Vercel 專案的環境變數全部是 Sensitive**——設了之後 dashboard 和
   `vercel env pull` 都拿不回值(pull 回來全是空字串)。忘了 key 就只能輪替。
   已登進 TRAPS。
2. **本機 vercel CLI 有多個帳號**:部署 html2u 的帳號不是預設登入的那個
   (kaiwu-7125 底下有一個同名空殼專案,零部署,容易誤 link)。操作 prod 前
   先 `vercel whoami` 確認。
3. GitHub 側:repo 屬個人帳號(tommyboy326),公司帳號 kaiwutech-TW 已受邀為
   collaborator 並接受(push 權限確認)。本 repo git identity 設為公司帳號
   (repo-local config)。

## 交付 / Commits

45553b8(MCP server + `.mcp.json`);key 輪替與註冊不在 git 內:
- Vercel:`ADMIN_API_KEY` 移除重建(production + preview),`vercel redeploy` 生效
- 本機:key 寫入 `.env.local`(gitignored);`claude mcp add --scope user html2u`
  註冊於 `~/.claude.json`,目前指向本 worktree 路徑

## 驗證證據

- MCP stdio 協定:initialize / tools/list / tools/call 手動管線測試正常;
  無 key 時回明確錯誤訊息而非 crash
- 端到端:透過 MCP tool 建立分享 → 回傳 `/s/<id>` 連結(201)→ 抓 wrapper 頁
  → 追 iframe 的 `raw?t=` URL → 內容含測試字串「html2u MCP e2e 2026-08-05」,
  逐字命中
- 舊 key 已因輪替失效(原值無人持有,無既有整合受影響)

## 未完 / 交接

- MCP 註冊路徑指向 feature branch worktree;merge 回 main 後改指穩定 clone
  (`claude mcp add --scope user html2u -- node ~/orca/html2u/mcp/html2u-mcp.mjs`)
- branch 尚未推上 GitHub / 開 PR
