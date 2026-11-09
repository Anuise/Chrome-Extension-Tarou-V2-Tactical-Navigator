# 07: 匯出戰鬥紀錄

**What to build:** 使用者實戰打完，在側欄「戰鬥腳本」頁按「匯出戰鬥紀錄」，把 upstream 的 `battleRecord`（最近 10 場戰鬥）全部原樣下載成一個 JSON 檔，交給腳本作者分析腳本準不準。這顆按鈕是使用者要求加的；spec 的 Out of Scope 排除的是「匯出資料給 skill 自動反推腳本」，不包含這顆按鈕。只做這顆按鈕：不篩選場次，也不記錄逐回合的 buff。

**Blocked by:** 04

**Status:** ready-for-human

- [x] 「目前戰鬥」分頁有「匯出戰鬥紀錄」按鈕，不在戰鬥中也能按
- [x] 匯出內容是 `battleRecord` 原樣，全部場次，依原順序
- [x] 檔名 `tn-battle-record-YYYYMMDD-HHmmss.json`（本機時間）
- [x] 沒有紀錄時顯示「沒有戰鬥紀錄可以匯出」，不下載
- [x] 匯出成功時顯示「已匯出最近 N 場」
- [x] 最新一場可能還沒打完時照樣下載，但顯示 warning，說明紀錄只到目前的回合
- [x] `battleRecord` 經 `src/tn/core/upstream.ts` 取用，只讀不寫；不 import `~/api`
- [x] 檔名與內容的組法、戰鬥中的判斷都是純函式，有 `node:test` 測試
- [x] `pnpm tc`、`pnpm bp` 通過；`pnpm lint` 本次改動的檔案 0 problems（整個 repo 有 291 個既有問題，與 main 相同）
- [ ] 手動驗證：在 Chrome 真正的側欄裡（不是用分頁開 `sidePanel/main.html`）按匯出，確認有下載、檔名正確，檔案內容是最近的戰鬥紀錄

## Comments

### 匯出（`src/tn/battle-script/record.ts`）

- `exportBattleRecord(records, now)`：回傳 `{ name, text }`，型別沿用 `manage.ts` 的 `ScriptFile`。
  - `name`：`tn-battle-record-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`。
  - `text`：`JSON.stringify(records, null, 2) + '\n'`，與 `exportScript` 相同。空陣列時為 `"[]\n"`。
- `records` 的型別是 `readonly unknown[]`：只原樣輸出，不讀任何欄位，所以不需要從 `upstream.ts` 轉出 `BattleRecord` 型別。
- 沒有紀錄的判斷放在側欄頁，純函式只負責組檔名與內容。

### 戰鬥中匯出的判斷

- upstream 開戰時（`start.json`）就把這一場 `unshift` 進 `battleRecord`，之後每次行動才更新這筆；結算頁不碰 `battleRecord`。
  - 所以打完再按，拿到的是完整的一場；戰鬥中按，只到目前的回合。
  - `BattleRecord` 沒有勝負或結束時間的欄位，從檔案看不出這場有沒有打完。
- `isLatestBattleOngoing(records, battleInfo)`：最新一場的 `String(raid_id)` 等於 `battleInfo.bossInfo.battleId`，而且 `bossInfo.hp > 0` 時為 true。
  - boss 被擊倒（scenario 有 `die`）或收到 `battleFinish` 時，upstream 會把 `hp` 設為 0。
  - 全滅、撤退的場次 `hp` 也大於 0，所以提示用「可能」。
- 為 true 時照樣下載，但顯示 warning：「已匯出最近 N 場。最新一場可能還沒打完，紀錄只到第 T 回合；結算畫面出現後請再匯出一次」。T 取最新一場的 `turn`。這則提示不會自動消失，要按關閉。
- 其他情況顯示「已匯出最近 N 場」。

### 側欄頁

- `upstream.ts` 的 `export { battleInfo } from '~/logic'` 改成 `export { battleInfo, battleRecord } from '~/logic'`。側欄頁只讀 `battleRecord.value`，不寫入。
- 下載原本寫在 `handleExport` 裡，抽成同檔的 `download({ name, text })`，匯出腳本與匯出戰鬥紀錄共用。
- 按鈕放在「目前戰鬥」分頁底部，與「複製目前關卡資訊」排成一列：
  - 「複製目前關卡資訊」從 `v-if="inBattle"` 的區塊移到這一列，加上 `v-if="inBattle"`，行為不變。
  - 「匯出戰鬥紀錄」一直顯示。`battleRecord` 是空陣列時（例如剛安裝、還沒打過任何一場），按下會提示「沒有戰鬥紀錄可以匯出」。
  - 兩顆按鈕排成一列，是因為 Element Plus 對相鄰的 `el-button` 加 `margin-left: 12px`，上下疊放時第二顆會偏右。

### 用法

打完一場、結算畫面出現後，開側欄「戰鬥腳本」頁，在「目前戰鬥」分頁按「匯出戰鬥紀錄」。瀏覽器會下載 `tn-battle-record-<日期>-<時間>.json`，把這個檔交給腳本作者。

- 只保留最近 10 場，參戰（加入別人的房間）也算一場，超過 10 場時最舊的會被擠掉。打完要盡快匯出。
- 檔內最新的在最前面（upstream 以 `unshift` 加入新場次）。
- 檔名的時間是匯出的時間；每場的開戰時間看檔內的 `startTimestamp`。

### 限制

upstream 的 `battleRecord` 本來就沒有記錄下列資料，分析前要先知道。這次不改程式；需要時另開票，在 `tnUnpack` 逐回合記錄到 `tn:` key。

- 沒有每回合的 boss buff 和計量條（破壞之力）。腳本的 `bossBuff`、`gauge` 條件無法用這個檔核對，要請使用者另外描述或截圖。
- 預兆（`actionQueue[].interrupt_display_text`）和 HP%（`bossHpPercent`）只在每回合第一個動作時記一次。回合中途才出現的預兆不會記到該回合，`special_skill_interrupt` 可能標在更早的回合。
- 技能只有 id（和圖示），沒有技能名稱和施放者，無法直接對照腳本的「角色：技能」。
- 檔案大約 1.5～2 MB（以 10 場、每場 70 回合估算）。分析前先依 `quest_id`、`raid_id`、`startTimestamp` 挑出要看的場次。
- 魔戰一技能每次使用都會帶 base64 圖片（`aim`、`subAbility`，每段約 4 KB）。

### 檔案內容與隱私

檔內有 deck 的 `paramId`（持有物的實例 id）、`raid_id`、開戰時間 `startTimestamp`、擴充 ID（忍者一技能的 `aim` 是 `chrome-extension://<擴充 ID>/…`），也可能有 `personal_buff_user_id`；不過濾，因為這是使用者自己的資料，只在本機交給腳本作者分析，不會公開。

### 驗證紀錄

- `node:test`：`src/tn/battle-script/record.test.ts` 10 個測試（`exportBattleRecord` 5 個、`isLatestBattleOngoing` 5 個），`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 87 個全部通過。
- `pnpm tc`、`pnpm bp` 通過。
- `pnpm lint`：本次改動的 6 個檔 0 problems；整個 repo 291 problems，與 main 相同，都在既有檔案。
- 冒煙測試：以 Playwright（Chromium 1234，新版 headless）未封裝載入 `dist/`，寫入假的 `battleInfo`、`battleRecord` 後，用分頁開側欄頁按匯出，4 個情境都符合預期：
  - 戰鬥中（最新一場是目前的戰鬥，boss HP 大於 0）：下載 1 個，含 2 場；warning「已匯出最近 2 場。最新一場可能還沒打完，紀錄只到第 3 回合；結算畫面出現後請再匯出一次」，有關閉鈕，4.8 秒後仍顯示。
  - 已擊倒（HP 為 0）、目前的戰鬥不是最新一場：都下載 1 個；success「已匯出最近 2 場」，會自動消失。
  - 沒有紀錄：下載 0 個；warning「沒有戰鬥紀錄可以匯出」。
- 在真正的側欄裡按的手動驗證尚未進行。
