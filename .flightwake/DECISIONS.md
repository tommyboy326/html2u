<!-- flightwake DECISIONS — append-only。一行一決策,新的加在最上面。 -->
<!-- 什麼算「決策」:關掉了其他選項的選擇。格式:日期 | 決策 | why | 觸發重評條件(選填) -->
<!-- 推翻決策:不刪舊行 — 新決策一行寫明取代哪天的哪條;舊行「決策」欄開頭加 [superseded→新日期]。新舊衝突時以此判方向。 -->

# 決策日誌

| 日期 | 決策 | 為什麼 | 重評條件 |
|---|---|---|---|
| 2026-08-05 | Claude Code 串接走 MCP server(`mcp/html2u-mcp.mjs`),且零依賴手刻 stdio 協定而非用 @modelcontextprotocol/sdk | 這個 repo 平常不裝 node_modules,單一 tool 用 SDK 不划算;API key 只從 env/.env.local 讀,不落在 .mcp.json | tool 數量成長或 MCP 協定改版時改用 SDK |
| 2026-08-05 | 採用 flightwake 記錄 session 工作,與既有 GSD(`.planning/`)並存而非取代 | GSD 管 milestone 規劃,flightwake 管跨 session 交接;靠 git 考古冷啟動成本太高 | 若兩框架的 STATE 持續互相落後,考慮合併為單一來源 |
| {{YYYY-MM-DD}} | {{採用 X 而非 Y}} | {{一句話}} | {{什麼情況要回頭看(選填)}} |
