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

## Comments

### schema v1 的驗證規則（04、05 沿用）

- 型別在 `types/modules/tn.d.ts`：`BattleScript`、`BattleScriptRule`、`BattleScriptCondition`、`BattleScriptAdvice`、`BattleScriptRange`，以及儲存格式 `StoredBattleScript`。
- 必要欄位：腳本的 `version`、`name`、`questId`、`rules`；規則的 `note`、`when`、`advice`。`when` 可以是 `{}`（恆成立），`rules` 與 `advice` 可以是空陣列。
- 選填欄位：`battleCount`（正整數）；`party`（寫了就要同時有 `characters` 與 `summons` 兩個字串陣列，只供顯示）。
- 所有字串欄位都必須是非空字串。`omen` 或 `bossBuff` 是空字串時，子字串與前綴比對會恆成立。
- `hp`、`gauge` 必須是兩個數字組成的陣列；`turn` 另外可以寫單一數字。
- 操作建議有 `text` 欄位時視為 `{ text }`，否則視為 `{ character, skill }`。
- 每一層（腳本、`party`、規則、`when`、操作建議）都不接受未知欄位。打錯欄位名稱（例如 `hpp`、`battlecount`）會讓條件被靜默忽略，規則變成恆成立，或腳本比對所有場次。
- `version` 有寫但不是 `1` 時只回報版本錯誤，不再以 v1 的格式檢查其他欄位。
- 驗證通過時回傳輸入物件本身，不做正規化（例如反向區間不排序），所以匯出後再匯入的結果相同。

### `validateScript` 的 error 格式

- 每個 error 是 `{ path, ruleIndex?, message }`：
  - `path`：欄位路徑，例如 `rules[2].when.hp`、`party.characters`、`rules[0].advice[1].skill`。整份輸入不是 JSON 物件時為空字串。
  - `ruleIndex`：0 起算，等於 `path` 中的 `rules[n]`；錯誤不在任何規則內時省略。
  - `message`：繁體中文說明，不含路徑。
- 顯示時組成「path：message」，`path` 為空字串時只顯示 message。側欄頁就是這樣顯示。
- 一次回報全部錯誤，依欄位與規則的順序排列。

### `selectAdvice` 的回傳與選中腳本的 key

- 回傳 `{ matchedScripts, selectedScript, activeRules }`：
  - `matchedScripts`：`{ key, script }[]`，與目前戰鬥相符的已啟用腳本，保持輸入順序。
  - `selectedScript`：`selectedScriptKey` 對應的相符腳本；未指定或沒有對應（例如已停用、別的關卡）時取第一份；沒有相符腳本時為 `undefined`。
  - `activeRules`：選中腳本中成立的規則，保持腳本順序。
- `key` 只由 questId 與 name 決定，重新匯入新版內容後不變。04 切換腳本時把 `matchedScripts[i].key` 傳回 `selectedScriptKey`，持久化也存這個字串。key 的格式是核心模組的內部細節，不要自己組。
- `bossBuff` 是前綴比對：寫 `4052` 也會命中 `40521_1`。只想比對 buff ID 4052 時寫 `4052_`（05 的 skill 產出腳本時要注意）。

### 儲存 `tn:battle-scripts`

- 值為 `StoredBattleScript[]`，也就是 `{ enabled, script }[]`，依匯入順序排列。`script` 是匯入檔的原始內容，匯出時直接輸出它。
- `src/tn/battle-script/store.ts` 匯出 `battleScripts`（storage ref）與 `saveScript(script)`：同 questId + name 的舊版在原位置覆蓋，新腳本加在最後；匯入的腳本一律啟用，覆蓋時也是。
- store 模組會帶入 chrome API，核心模組與 `node:test` 測試不可 import 它。

### 側欄頁

- 戰鬥中：boss 狀態卡與 questId／第幾場下方是建議區，顯示選中腳本的名稱與成立的規則（說明文字 + 操作建議）。沒有相符腳本時顯示「無符合腳本」；有相符腳本但沒有成立的規則時顯示「目前沒有成立的規則」。
- 「匯入戰鬥腳本」按鈕在戰鬥中與不在戰鬥中都會顯示，一次選一個 `.json`。JSON 解析或驗證失敗時，按鈕下方列出檔名與每個錯誤，不寫入任何資料。
- 腳本清單與同關卡多份腳本的切換留給 04；目前一律選第一份。

### 驗證紀錄

- `node:test`：`src/tn/battle-script/core.test.ts` 共 29 個測試（`validateScript` 12 個、`selectAdvice` 17 個）。
- 冒煙測試：以 Playwright 用未封裝方式載入 `dist/`，寫入假的 `battleInfo` 後在側欄頁實際匯入。確認了以下行為：
  - 建議隨回合、HP、計量條、預兆、boss buff 的變化即時更新。
  - 匯入只改動 `tn:battle-scripts`，同 questId + name 重新匯入時覆蓋。
  - 驗證失敗與非 JSON 檔都會列出錯誤，且不寫入。
  - 不在戰鬥中時仍可匯入。
- 實戰手動驗證尚未進行，需要使用者在遊戲中完成。
