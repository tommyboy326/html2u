---
status: resolved
phase: 01-security-headers-foundation
source: [01-VERIFICATION.md]
started: 2026-05-29
updated: 2026-05-29
---

## Current Test

[all items resolved]

## Tests

### 1. 正式環境 pg_cron 證據擷取(SEC-OPS-01 / 準則 #4)
expected: 對 html2u 正式 Supabase 專案執行 `select jobname, schedule, command from cron.job order by jobname;`,回傳三列 — `cleanup_csp_violations` (`0 3 * * *`)、`cleanup_rate_limits` (`*/30 * * * *`)、`cleanup_shares` (`0 * * * *`);Database → Extensions 顯示 `pg_cron` 已啟用;`select 1 from public.csp_violations limit 1;` 不報 relation-not-found。
result: PASSED(2026-05-29)— 操作者在正式環境 SQL editor 執行查詢,回傳正好三列:`cleanup_csp_violations` (`0 3 * * *`)、`cleanup_rate_limits` (`*/30 * * * *`)、`cleanup_shares` (`0 * * * *`),delete 指令與 schema.sql 一致。pg_cron 順利自啟(無權限錯誤,cron.schedule 回傳 jobid 1-3)。

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- 已無殘留。初次操作者口頭確認其實是跑到了**舊的存檔查詢**(缺 Phase 1 新增段落),首次驗證時 `cron.job` 不存在 —— 正是 T-01-08 gate 設計要攔的假陽性。重跑當前 schema.sql 的 Phase 1 區塊後修正,三列證據已擷取,準則 #4 關閉,整個 phase 轉 passed。
