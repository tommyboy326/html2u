---
updated: 2026-08-05
updated_by: claude-code (kaiwu)
latest_record: records/260805-mcp-share-html.md
health: green   # prod 端到端驗收通過(MCP → /api/shares → 分享頁渲染)
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

v2 milestone 進行中:Phase 1(Security Headers Foundation)已驗證關閉(commit
b99bd5b)+ 一批 ad-hoc 加固(803c3a6..119da6c)都在 main 且已部署。本 branch
(`kaiwu-aideamed/feat-mcp-claude-code`)新增了 Claude Code 串接:MCP server
`mcp/html2u-mcp.mjs` 已註冊、prod 驗收通過(見 latest_record);prod 的
ADMIN_API_KEY 已輪替。

# 進行中(未完成勿刪)

- [ ] MCP branch 未推上 GitHub / 未開 PR;merge 後 MCP 註冊路徑要改指穩定 clone
      (細節見 latest_record 的「未完/交接」)

# 下一步入口

1. 推 branch + 開 PR 到 main(`tommyboy326/html2u`;公司帳號已有 push 權)
2. Phase 2「i18n Foundation Bundle」→ 讀 `.planning/ROADMAP.md` 的 Phase 2 段,
   走 GSD `/gsd-execute-phase`(或先 plan);開工前先把 `.planning/STATE.md`
   對齊現況(它停在 2026-05-29 的 Phase 1 verifying,已落後)

# 常備事實(這個 repo 的 3-5 條保命知識)

- 規範/constraints/架構都在 CLAUDE.md + AGENTS.md(session 自動載入),STATE 不重抄
- `.planning/` 是 GSD 框架的地盤(milestone 規劃);`.flightwake/` 管 session 紀錄
  ——兩邊各有一個 STATE.md,別混用(見 TRAPS)
- worktree 可能沒裝 node_modules;typecheck/build 前先 `npm install`
- Next.js 16 與訓練資料有 breaking changes——動 code 前先讀
  `node_modules/next/dist/docs/`(AGENTS.md 第一條)
