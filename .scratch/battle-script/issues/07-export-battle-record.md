# 07: 匯出戰鬥紀錄

**What to build:** 使用者實戰打完，在側欄「戰鬥腳本」頁按「匯出戰鬥紀錄」，把 upstream 的 `battleRecord`（最近 10 場戰鬥）全部原樣下載成一個 JSON 檔，交給腳本作者分析腳本準不準。只做這顆按鈕：不篩選場次，也不記錄逐回合的 buff。

**Blocked by:** 04

**Status:** ready-for-human

- [x] 「目前戰鬥」分頁有「匯出戰鬥紀錄」按鈕，不在戰鬥中也能按
- [x] 匯出內容是 `battleRecord` 原樣，全部場次，依原順序
- [x] 檔名 `tn-battle-record-YYYYMMDD-HHmmss.json`（本機時間）
- [x] 沒有紀錄時顯示「沒有戰鬥紀錄可以匯出」，不下載
- [x] `battleRecord` 經 `src/tn/core/upstream.ts` 取用，只讀不寫；不 import `~/api`
- [x] 檔名與內容的組法是純函式，有 `node:test` 測試
- [x] `pnpm tc`、`pnpm lint`、`pnpm bp` 通過
- [ ] 手動驗證：實戰後匯出，檔案內容是最近的戰鬥紀錄

## Comments

### 匯出（`src/tn/battle-script/record.ts`）

- `exportBattleRecord(records, now)`：回傳 `{ name, text }`，型別沿用 `manage.ts` 的 `ScriptFile`。
  - `name`：`tn-battle-record-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`。
  - `text`：`JSON.stringify(records, null, 2) + '\n'`，與 `exportScript` 相同。
- `records` 的型別是 `readonly unknown[]`：只原樣輸出，不讀任何欄位，所以不需要從 `upstream.ts` 轉出 `BattleRecord` 型別。
- 沒有紀錄的判斷放在側欄頁，純函式只負責組檔名與內容。

### 側欄頁

- `upstream.ts` 的 `export { battleInfo } from '~/logic'` 改成 `export { battleInfo, battleRecord } from '~/logic'`。側欄頁只讀 `battleRecord.value`，不寫入。
- 下載原本寫在 `handleExport` 裡，抽成同檔的 `download({ name, text })`，匯出腳本與匯出戰鬥紀錄共用。
- 按鈕放在「目前戰鬥」分頁底部，與「複製目前關卡資訊」排成一列：
  - 「複製目前關卡資訊」從 `v-if="inBattle"` 的區塊移到這一列，加上 `v-if="inBattle"`，行為不變。
  - 「匯出戰鬥紀錄」一直顯示。`battleInfo` 沒有資料時（例如剛安裝），按下會提示「沒有戰鬥紀錄可以匯出」。
  - 兩顆按鈕排成一列，是因為 Element Plus 對相鄰的 `el-button` 加 `margin-left: 12px`，上下疊放時第二顆會偏右。

### 用法

打完一場後開側欄「戰鬥腳本」頁，在「目前戰鬥」分頁按「匯出戰鬥紀錄」，瀏覽器會下載 `tn-battle-record-<日期>-<時間>.json`，把這個檔交給腳本作者。檔內是最近 10 場，最新的在最前面（upstream 以 `unshift` 加入新場次）。

### 驗證紀錄

- `node:test`：新增 `src/tn/battle-script/record.test.ts` 3 個測試，`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 80 個全部通過。
- `pnpm tc`、`pnpm bp` 通過。
- `pnpm lint`：本次改動的 4 個檔 0 problems；整個 repo 291 problems，與 main 相同，都在既有檔案。
- 手動驗證尚未進行，需要使用者在瀏覽器實戰後確認。
