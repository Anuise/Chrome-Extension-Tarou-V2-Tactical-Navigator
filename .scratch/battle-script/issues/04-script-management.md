# 04: 戰鬥腳本管理

**What to build:** 玩家能完整管理已匯入的戰鬥腳本：一次匯入多個檔案（一份失敗不影響其他份），看到錯在哪條規則、哪個欄位；勾選啟用；刪除；匯出成 JSON；同一關卡同名腳本重新匯入時覆蓋；同一關卡有多份已啟用腳本時在建議區切換（例如破壞／再生神意版）。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 多檔匯入；每份各自驗證，成功與失敗分開回報
- [ ] 驗證錯誤列出檔名、規則索引、欄位路徑
- [ ] 腳本唯一鍵為 questId + name，重複匯入時覆蓋
- [ ] 腳本清單顯示名稱、關卡、規則數、出戰名單，每份有啟用勾選框
- [ ] 可刪除腳本、可匯出單份腳本為 JSON，匯出內容可再匯入且結果相同
- [ ] 同關卡多份已啟用腳本時可切換，選擇在頁面重新開啟後保留
- [ ] 不在戰鬥中時頁面以腳本管理為主
- [ ] `pnpm tc`、`pnpm lint`、`pnpm bp` 通過；手動驗證以上操作

## Comments

### 匯入、刪除、匯出（`src/tn/battle-script/manage.ts`）

- 純函式，不依賴 Vue 與 chrome API，以 `node:test` 測試。核心模組 `core.ts` 仍然只匯出 `validateScript` 與 `selectAdvice`。
- `importScripts(stored, files)`：`files` 是 `{ name, text }[]`，回傳 `{ stored, imported, failures }`，不改動傳入的陣列。
  - `imported`：`{ fileName, scriptName }[]`；`failures`：`{ fileName, errors }[]`。兩者都依檔案順序。
  - `errors` 是可直接顯示的字串，沿用 03 的「path：message」格式，`path` 裡的 `rules[n]` 就是規則索引。整份不是物件時只有 message；不是 JSON 時為「不是有效的 JSON：…」。
  - 同 questId + name 的舊版在原位置覆蓋並重新啟用，新腳本加在最後；同一批有重複時，後面的覆蓋前面的。
- `removeScript(stored, script)`：刪除同 questId + name 的那一份。
- `exportScript(script)`：回傳 `{ name, text }`，`name` 為 `<questId>-<name>.json`，`text` 為 `JSON.stringify(script, null, 2) + '\n'`。匯出後再匯入，`tn:battle-scripts` 不變。名稱含檔名不允許的字元時，由瀏覽器下載時替換。
- 03 的 `store.ts` `saveScript` 已移除。側欄頁呼叫 `importScripts` 後整份寫回 `battleScripts`；全部失敗時不寫入。

### 選中腳本的持久化

- 存在 `tn:battle-script-selected`（`store.ts` 的 `selectedScriptKey`），值是 `selectAdvice` 回傳的 `matchedScripts[i].key`，預設為空字串（取第一份）。
- 只存一個值、不分關卡。key 含 questId，換到別的關卡時 `selectAdvice` 自然退回第一份；回到原關卡且沒有再切換過時恢復原選擇。
- 選中的腳本停用或刪除時退回第一份。儲存的值不清除，重新啟用或重新匯入同名腳本時恢復選擇。
- 同關卡相符腳本超過一份時，建議區上方的「腳本：」顯示 `el-select`；只有一份時顯示名稱。

### 版面：「目前戰鬥」與「腳本管理」兩個分頁

- 依 01 的判斷，battleInfo 戰後不清除，頁面幾乎一直「在戰鬥中」。腳本管理若接在建議區下方，戰前整理要捲過 boss 狀態卡與建議區。
- 所以頁面分成兩個 `el-tabs` 分頁：
  - 「目前戰鬥」：boss 狀態卡、questId／第幾場、建議區、「複製目前關卡資訊」。
  - 「腳本管理」：「匯入戰鬥腳本」按鈕、匯入結果、腳本清單。03 放在頁面底部的匯入按鈕移到這裡。
- 預設分頁：開啟頁面時在戰鬥中是「目前戰鬥」，不在戰鬥中（剛安裝）是「腳本管理」。
- `battleInfo.bossInfo.battleId` 變成新值時（進入新的一場，或頁面載入後才讀到戰鬥資料）自動切到「目前戰鬥」。同一場戰鬥中的狀態更新不會切換，戰鬥中也能停留在「腳本管理」操作。

### 腳本清單與匯入結果

- 每份一張卡片：
  - 第一行：啟用勾選框、名稱、「匯出」、「刪除」。勾選框沒有文字，`aria-label` 為「啟用「名稱」」。
  - 下方：「關卡 questId 第 N 場・規則 N 條」（沒寫 `battleCount` 時省略場次），以及角色、召喚；沒有 `party` 時顯示「出戰名單：未填寫」。
- 勾選框直接 `v-model` 到 storage 裡的 `enabled`，由 deep watch 寫回。
- 刪除用 `el-popconfirm` 確認，標題與按鈕文字自己傳繁中：「確定刪除「名稱」？」、「刪除」、「取消」。
- 匯入結果：
  - 成功：一個綠色 `el-alert`，標題「已匯入 N 份」，逐行「檔名：腳本名稱」。
  - 失敗：每個檔案一個紅色 `el-alert`，標題「匯入失敗：檔名」，逐行列出錯誤。
  - 都可以關閉；下次匯入時整份換掉。

### 驗證紀錄

- `node:test`：新增 `src/tn/battle-script/manage.test.ts` 9 個測試，全部 68 個測試通過。
- 冒煙測試：以 Playwright 用未封裝方式載入 `dist/`，寫入假的 `battleInfo` 後實際操作，42 項通過：
  - 多檔匯入（2 份成功、2 份失敗）分開回報；錯誤列出檔名、規則索引、欄位路徑；匯入只改動 `tn:battle-scripts`。
  - 清單內容；不在戰鬥中時預設顯示「腳本管理」；進入新的一場時自動切到「目前戰鬥」。
  - 切換選中腳本，重新開啟頁面後保留；停用或刪除選中的腳本時退回第一份，重新啟用時恢復。
  - 匯出檔名與內容；匯出檔再匯入後 `tn:battle-scripts` 不變；同名重新匯入在原位置覆蓋並重新啟用；刪除前確認，取消時不刪。
- 實戰手動驗證尚未進行，需要使用者在遊戲中完成。
