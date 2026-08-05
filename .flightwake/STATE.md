---
updated: 2026-08-05
updated_by: claude-code (kaiwu)
latest_record: records/260805-flightwake-init.md
health: green   # main 已部署且 Phase 1 驗證通過;本次未動 code
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

v2 milestone 進行中:Phase 1(Security Headers Foundation)已完成並通過驗證
(8/8 threat criteria,見 commit b99bd5b),之後又落地一批 GSD 流程外的 ad-hoc
安全加固(803c3a6..119da6c),全部在 main 且已部署。flightwake 剛初始化
(見 latest_record)。

# 進行中(未完成勿刪)

- [ ] 無進行中的建設;Phase 2(i18n)尚未開工

# 下一步入口

1. Phase 2「i18n Foundation Bundle」→ 讀 `.planning/ROADMAP.md` 的 Phase 2 段,
   走 GSD `/gsd-execute-phase`(或先 plan)
2. 開工前先把 `.planning/STATE.md` 對齊現況(它停在 2026-05-29 的 Phase 1
   verifying,落後 9 個 commits)

# 常備事實(這個 repo 的 3-5 條保命知識)

- 規範/constraints/架構都在 CLAUDE.md + AGENTS.md(session 自動載入),STATE 不重抄
- `.planning/` 是 GSD 框架的地盤(milestone 規劃);`.flightwake/` 管 session 紀錄
  ——兩邊各有一個 STATE.md,別混用(見 TRAPS)
- worktree 可能沒裝 node_modules;typecheck/build 前先 `npm install`
- Next.js 16 與訓練資料有 breaking changes——動 code 前先讀
  `node_modules/next/dist/docs/`(AGENTS.md 第一條)
