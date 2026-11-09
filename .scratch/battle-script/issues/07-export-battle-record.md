# 07: 匯出戰鬥紀錄

**What to build:** 使用者實戰打完，在側欄「戰鬥腳本」頁按「匯出戰鬥紀錄」，把 upstream 的 `battleRecord`（最近 10 場戰鬥）全部原樣下載成一個 JSON 檔，交給 Claude 分析腳本準不準。這顆按鈕是使用者要求加的；spec 的 Out of Scope 排除的是「匯出資料給 skill 自動反推腳本」，不包含這顆按鈕。只做這顆按鈕：不篩選場次，也不記錄逐回合的 buff。

**Blocked by:** 04

**Status:** ready-for-human

- [x] 「目前戰鬥」分頁有「匯出戰鬥紀錄」按鈕，不在戰鬥中也能按
- [x] 匯出內容是 `battleRecord` 原樣，全部場次，依原順序
- [x] 檔名 `tn-battle-record-YYYYMMDD-HHmmss.json`（本機時間）
- [x] 沒有紀錄時顯示「沒有戰鬥紀錄可以匯出」，不下載
- [x] 匯出成功時顯示「已匯出最近 N 場」
- [x] 目前這場可能還沒打完時照樣下載，但顯示 warning：還在打時紀錄只到進行中的回合，已經結束（包括全滅、撤退）時紀錄是完整的；連按時畫面上只留最新一則，切到別的側欄頁或進入新的一場時關掉
- [x] `battleRecord` 經 `src/tn/core/upstream.ts` 取用，只讀不寫；不 import `~/api`
- [x] 檔名與內容的組法、找出目前這場的判斷都是純函式，有 `node:test` 測試
- [x] `pnpm tc`、`pnpm bp` 通過；`pnpm lint` 本次改動的檔案 0 problems（整個 repo 有 291 個既有問題，與 main 相同）
- [ ] 手動驗證：照下方「手動驗證步驟」，在 Chrome 真正的側欄裡做完 5 步

## Comments

### 匯出（`src/tn/battle-script/record.ts`）

- `exportBattleRecord(records, now)`：回傳 `{ name, text }`，型別沿用 `manage.ts` 的 `ScriptFile`。
  - `name`：`tn-battle-record-${dayjs(now).format('YYYYMMDD-HHmmss')}.json`。
  - `text`：`JSON.stringify(records, null, 2) + '\n'`，與 `exportScript` 相同。空陣列時為 `"[]\n"`。
- `records` 的型別是 `readonly unknown[]`：只原樣輸出，不讀任何欄位，所以不需要從 `upstream.ts` 轉出 `BattleRecord` 型別。
- 沒有紀錄的判斷放在側欄頁，純函式只負責組檔名與內容。

### 戰鬥中匯出的判斷

- upstream 開戰時（`start.json`）就把這一場 `unshift` 進 `battleRecord`，之後每次行動才更新這筆；結算頁不碰 `battleRecord`。
  - 所以打完再按，拿到的是完整的一場；戰鬥中按，只到進行中的回合。
  - `BattleRecord` 沒有勝負或結束時間的欄位，從檔案看不出這場有沒有打完。
- `findOngoingRecord(records, battleInfo)`：`battleInfo.bossInfo.hp > 0` 時，回傳 `String(raid_id) === bossInfo.battleId` 的那筆；否則回傳 `undefined`。
  - 和 upstream 一樣用 `find` 找目前這場，不假設它在第一筆。回到已有紀錄的戰鬥（例如多人戰回到較早的房間）時，upstream 不會把它移到最前面。
  - boss 被擊倒（scenario 有 `die`）或收到 `battleFinish` 時，upstream 會把 `hp` 設為 0。
- 這個判斷只能盡力而為，boss HP 不一定反映戰鬥有沒有結束：
  - 全滅、撤退時 upstream 不動 `hp`；多人戰由別人擊倒、而 upstream 沒有收到 `battleFinish`（它只在附加 debugger 時才收得到）時，`hp` 也停在大於 0。這些場次都會被當成還在打，所以 warning 要把「已經結束」的情況也寫進去。
  - 多隻敵人時，upstream 擊倒任何一隻都會把 `hp` 設成 0（不分位置），要等 0 號位的 HP 再更新才會改回來。這段期間不會出現 warning，而是顯示「已匯出最近 N 場」；0 號位先倒下時，可能整場剩下的回合都是這樣。
- 這段說明和 `record.ts` 的 `findOngoingRecord` 註解寫的是同一件事，改其中一邊時要同步改另一邊。
- 有找到時照樣下載，但顯示 warning：「已匯出最近 N 場。目前這場可能還沒打完：如果還在打，紀錄只到進行中的第 T 回合，打完後再匯出一次；如果這場已經結束（包括全滅、撤退），紀錄就是完整的」。
  - T 取找到那筆的 `turn`。回合數在普攻結果回來時就推進，所以第 T 回合通常還沒有任何行動，實際記完的是第 T−1 回合，因此寫「進行中的第 T 回合」。
  - 這則提示不會自動消失，要按關閉。它掛在整個側欄頁面上，不在「戰鬥腳本」頁裡，所以以下情況會自動關掉，畫面上不會留著過時的提示：
    - 再按一次匯出：先關掉上一則，畫面上只留最新一則。
    - 切到別的側欄頁：側欄各頁包在 `keep-alive` 裡，用 `onDeactivated` 關掉。
    - 進入新的一場（`battleId` 改變）。
- 其他情況顯示「已匯出最近 N 場」。

### 側欄頁

- `upstream.ts` 的 `export { battleInfo } from '~/logic'` 改成 `export { battleInfo, battleRecord } from '~/logic'`。側欄頁只讀 `battleRecord.value`，不寫入。
- 下載原本寫在 `handleExport` 裡，抽成同檔的 `download({ name, text })`，匯出腳本與匯出戰鬥紀錄共用。
- 按鈕放在「目前戰鬥」分頁底部，與「複製目前關卡資訊」排成一列：
  - 「複製目前關卡資訊」從 `v-if="inBattle"` 的區塊移到這一列，加上 `v-if="inBattle"`，行為不變。
  - 「匯出戰鬥紀錄」一直顯示。`battleRecord` 是空陣列時（例如剛安裝、還沒打過任何一場），按下會提示「沒有戰鬥紀錄可以匯出」。
  - 兩顆按鈕排成一列，是因為 Element Plus 對相鄰的 `el-button` 加 `margin-left: 12px`，上下疊放時第二顆會偏右。
- 「沒有戰鬥紀錄可以匯出」與「已匯出最近 N 場」照派工時指定的文字，不另外加最新一場的關卡或回合。要確認匯出到的是哪一場，對照側欄「战斗记录」頁（見「手動驗證步驟」第 4 步）。

### 用法

打完一場（出現結算畫面，或全滅後撤退）之後，開側欄「戰鬥腳本」頁，在「目前戰鬥」分頁按「匯出戰鬥紀錄」。瀏覽器會下載 `tn-battle-record-<日期>-<時間>.json`，把這個檔交給 Claude 分析，例如在 `tn-battle-script` skill 的對話中給出檔案路徑。交給 Claude 時，請它先讀這張票（`.scratch/battle-script/issues/07-export-battle-record.md`）的「限制」。讓 skill 自己先讀這些限制的流程，另開在 08（`issues/08-skill-reads-battle-record.md`，needs-triage）。

- 全滅後撤退，或參戰中途離開時，也會出現黃色提示。這場已經結束，檔案可以直接用。
- 檔案留在下載資料夾，把完整路徑給 Claude 就好，不要複製進 repo。檔內有持有物的實例 id 與擴充 ID，`.gitignore` 也沒有排除這個檔名。
- 只保留最近 10 場，參戰（加入別人的房間）也算一場，超過 10 場時最舊的會被擠掉。打完要盡快匯出。
- 檔內最新開的一場在最前面（upstream 以 `unshift` 加入新場次）。
- 檔名的時間是匯出的時間。每場的開戰時間看檔內的 `startTimestamp`（Unix 毫秒），或對照側欄「战斗记录」頁每張卡上的時間。

### 限制

upstream 的 `battleRecord` 本來就沒有記錄下列資料，分析前要先知道。這次不改程式；需要時另開票，在 `tnUnpack` 逐回合記錄到 `tn:` key。

- 沒有每回合的 boss buff 和計量條（破壞之力）。腳本的 `bossBuff`、`gauge` 條件無法用這個檔核對，要請使用者另外描述或截圖。
- 預兆（`actionQueue[].interrupt_display_text`）和 HP%（`bossHpPercent`）是每回合開始時的值：上一回合普攻（含 boss 行動）的結果回來、回合數改變時記一次；第 1 回合在開戰時記。回合中途的 HP 變化和預兆都不會記到該回合，`special_skill_interrupt` 可能標在更早的回合。
- 技能只有 id 和圖示，沒有技能名稱和施放者，無法直接對照腳本的「角色：技能」。
  - `deck` 存在時，主角技能可以用 `deck.leader.ability[].actionId` 對到 `name`。`actionList[].id` 是否和它同一套 id，還沒用實際資料確認。
- 每個角色的 `player[].condition` 是該角色最後一次出現狀態更新時的值：upstream 只覆蓋該次動作結果裡帶有 `condition` 的角色，其他角色保留更早的值。各角色的時間點不一定相同，也不是開場或逐回合的資料。
- 檔案大約 1.5～2 MB（以 10 場、每場 70 回合估算）。分析前先依 `quest_id`、`raid_id`、`startTimestamp` 挑出要看的場次。
- 魔戰一技能每次使用，`aim` 會帶兩段 base64 圖片，每段約 4 KB。有子技能的技能，每次使用都會複製一份 `subAbility` 清單。分析時兩者都可以忽略。

### 檔案內容與隱私

檔內有 deck 的 `paramId`（持有物的實例 id）與 `familiarId`、`raid_id`、開戰時間 `startTimestamp`、擴充 ID（忍者一技能的 `aim` 是 `chrome-extension://<擴充 ID>/…`），也可能有 `personal_buff_user_id`、`personal_debuff_user_id`；不過濾，因為這是使用者自己的資料，交給 Claude 分析時會送到模型服務，但不會放進 repo 或公開。

### 手動驗證步驟

1. `pnpm bp`，到 `chrome://extensions` 按這個擴充功能的「重新載入」。不要移除後再載入，移除會一併清掉 `chrome.storage` 裡的戰鬥紀錄。
   - 重新載入後，upstream 會關掉開過側欄的遊戲分頁。重新打開遊戲分頁再開始打；沒被關掉的話也要重新整理，舊分頁已經和擴充功能斷線，新的一場不會被記錄。
2. 打完一場，等結算畫面出現。開 Chrome 側欄，切到「戰鬥腳本」頁的「目前戰鬥」分頁，按「匯出戰鬥紀錄」。
3. 確認側欄出現綠色的「已匯出最近 N 場」，Chrome 的下載出現 `tn-battle-record-<匯出當下的日期>-<時間>.json`。
4. 對照側欄「战斗记录」頁：
   - 卡片數等於 N。
   - 第一張卡就是剛打完的那場（看 boss 圖示與開戰時間）。
   - 第一張卡的回合數等於檔案第一筆的 `turn`。
   - 第一張卡的時間和第一筆 `startTimestamp` 換算後的時間，到分鐘相同（卡片只顯示到分鐘）。換算可以在 DevTools 執行 `new Date(<startTimestamp>)`。
5. 下一場戰鬥中（boss 還沒倒）再按一次：
   - 出現黃色提示，回合數和遊戲畫面相同。
   - 提示不會自己消失，要按 × 關閉。
   - 不關閉、再按一次匯出時，畫面上仍只有一則黃色提示。
   - 不關閉、切到別的側欄頁（例如「战斗记录」）時，黃色提示會消失。

全滅後撤退時，也會出現同樣的黃色提示。這場已經結束，檔案可以直接用。

### 驗證紀錄

- `node:test`：`src/tn/battle-script/record.test.ts` 11 個測試（`exportBattleRecord` 5 個、`findOngoingRecord` 6 個），`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 88 個全部通過。
- `pnpm tc`、`pnpm bp` 通過。
- `pnpm lint`：本次改動的 7 個檔（含 08）0 problems；整個 repo 291 problems，與 main 相同，都在既有檔案。
- 冒煙測試：以 Playwright（Chromium 1234，新版 headless）未封裝載入 `dist/`，寫入假的 `battleInfo`、`battleRecord`（`raid_id` 222 第 3 回合、111 第 5 回合）後，用分頁開側欄頁按匯出。8 個情境都符合預期，每次都下載含 2 場的檔案（沒有紀錄時除外）：
  - 目前這場在第一筆（battleId 222，HP 大於 0）：warning，「進行中的第 3 回合」，有關閉鈕，4 秒後仍顯示。
  - 目前這場不在第一筆（battleId 111）：warning，「進行中的第 5 回合」。
  - 同上第一種情境連按兩次：下載 2 個，畫面上只有 1 則 warning。
  - 出現 warning 後切到「主页」：warning 關掉。
  - 出現 warning 後把 storage 的 `battleId` 改成 333（模擬新的一場）：warning 關掉。
  - HP 為 0、battleId 對不上任何一場：success「已匯出最近 2 場」，會自動消失。
  - 沒有紀錄：不下載，warning「沒有戰鬥紀錄可以匯出」。
  - 視窗寬 360px 時，warning 換成 4 行，關閉鈕仍在畫面內。
- 在真正的側欄裡按的手動驗證尚未進行。

尚待使用者：照「手動驗證步驟」在 Chrome 真正的側欄裡驗證（最後一項未勾選）。驗證完成後把最後一項打勾，Status 改為 `resolved`。
