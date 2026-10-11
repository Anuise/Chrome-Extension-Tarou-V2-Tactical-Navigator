# 03: 匯入戰鬥腳本並在戰鬥中顯示成立的規則

**What to build:** 玩家在側欄頁匯入一份戰鬥腳本 JSON，腳本預設啟用並保存在 extension。進入關卡相符的戰鬥後，建議區依目前狀態即時列出成立的規則（說明文字 + 操作建議），狀態改變時立即更新；沒有相符腳本時顯示「無符合腳本」。這是貫穿 schema、核心模組、儲存、UI 的 tracer bullet。schema v1 與比對語意見 spec。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 戰鬥腳本 schema v1 型別定義在 tn 型別模組
- [ ] 核心模組不依賴 Vue／chrome API，對外只有 `validateScript` 與 `selectAdvice`
- [ ] `selectAdvice` 支援全部五種條件：回合（單值或區間）、HP 區間、計量條區間、預兆子字串、boss buff status 前綴；AND 組合；區間含端點且端點順序不限；`when` 為空時恆成立
- [ ] 腳本相符：questId 相同，且腳本未寫 battleCount 或 battleCount 相同
- [ ] 成立的規則依腳本順序列出；不記錄觸發狀態
- [ ] 腳本存在 `tn:battle-scripts`，不寫入任何 upstream storage key
- [ ] 側欄頁可匯入單一 JSON，驗證失敗時顯示錯誤並拒絕
- [ ] `node:test` 測試涵蓋 `validateScript`（合法、缺欄位、型別錯、版本不支援、區間格式錯，errors 指出規則索引與欄位路徑）與 `selectAdvice`（各條件成立／不成立、端點、AND、順序、無相符、snapshot 欄位缺失不拋錯）
- [ ] `pnpm tc`、`pnpm lint`、`pnpm bp` 通過
- [ ] 手動驗證：匯入一份手寫測試腳本，實戰中建議隨回合／HP 變化
