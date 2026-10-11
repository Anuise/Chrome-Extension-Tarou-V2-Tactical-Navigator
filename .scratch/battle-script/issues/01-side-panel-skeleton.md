# 01: 側欄頁骨架與「複製目前關卡資訊」

**What to build:** 側欄新增「戰鬥腳本」頁（`tn-battle-script`）。頁面上方顯示 upstream「战斗信息」的 boss 狀態卡，並顯示目前戰鬥的 questId 與第幾場。頁面提供「複製目前關卡資訊」按鈕，把 questId、第幾場、boss 名稱、boss buff 的 status 清單以 JSON 複製到剪貼簿，供協作 skill 當起點。這是第一個 tn 工具，所以要一併建立最小的 tn core（側欄頁註冊清單、upstream 介面層），並在白名單內的側欄掛鉤點接上。見 spec「模組」與 ADR-0008。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 側欄選單出現「戰鬥腳本」頁，透過白名單的側欄掛鉤點註冊，掛鉤點帶 `[TN]` 標記
- [ ] boss 狀態卡經由 upstream 介面層 import upstream 元件，未複製、未修改任何 upstream view 檔
- [ ] 戰鬥中頁面顯示 questId 與第幾場；不在戰鬥中時不報錯
- [ ] 確認 `battleInfo` 是否能取得第幾場（battle count）；取不到時顯示為 1，並在本檔 Comments 記錄查證結果
- [ ] 「複製目前關卡資訊」複製的 JSON 含 questId、battleCount、boss 名稱、boss buff status 陣列
- [ ] 側欄頁把 upstream 的 `battleInfo` 轉成 spec 定義的 `BattleSnapshot`（供 03 使用）
- [ ] `pnpm tc`、`pnpm lint`、`pnpm bp` 通過；`git diff --name-only upstream/main...HEAD` 只含 fork 路徑與白名單檔
- [ ] 手動驗證：實際進一場戰鬥，頁面資訊隨戰鬥更新，複製內容正確

## Comments

### 第幾場（battle count）查證

- 結論：`battleInfo` 取不到第幾場。頁面一律顯示 1，`BattleSnapshot.battleCount` 也固定為 1（spec：取不到時視為 1）。
- 原始資料是 `/rest/(raid|multiraid)/start.json` 回應的 `battle.count`（字串）與 `battle.total`（數字），型別見 `types/modules/source.d.ts` 的 `BattleStartJson.battle`。
- upstream 只在 `src/composables/useDataCenter.ts` 的 start.json 分支讀取它：轉成數字後交給 `processBossInfo`，用途是抽樣上傳到 upstream 作者的伺服器。`src/composables/useBattleLog.ts` 的 `handleStartJson` 建立 `bossInfo` 時沒有保存它；`BattleInfo`、`BossInfo`、`BattleRecord` 也都沒有對應欄位。
- upstream key `sentBossInfo` 存有 `${questId}:${battleCount}`，但它是上傳去重用的 LRU 清單：沙盒戰不會更新，抽中上傳卻失敗時會刪掉當場的 key，所以不採用。
- 之後若需要真正的第幾場，可以在白名單的 `tnUnpack` 掛鉤點解析 start.json，存成 `tn:` key。這超出本 spec 範圍，本 ticket 沒有實作。

### 「在戰鬥中」的判斷方式（03、04 沿用）

- 判斷：`battleInfo.bossInfo` 存在就視為在戰鬥中。
- 程式位置：`BattleSnapshot` 定義在 `src/tn/battle-script/core.ts`。`src/tn/battle-script/snapshot.ts` 的 `toBattleSnapshot` 在沒有 `bossInfo` 時讓 `questId` 為 `undefined`，側欄頁以 `snapshot.questId !== undefined` 判斷。
- 依據：upstream 沒有「戰鬥中」旗標，「战斗信息」頁同樣以「有最近一場的戰鬥資料」決定是否顯示。`bossInfo` 只在 start.json 時重建，戰鬥結束後不清除。
- 限制：戰鬥結束（勝利、撤退、全滅）後，頁面仍顯示最後一場的狀態，直到下一場的 start.json。只有剛安裝或 storage 被清空時，才會是「不在戰鬥中」。
- 不採用 `bossInfo.hp === 0` 判斷戰鬥結束：打死任何一隻小怪（例如顕現第二階段的四王天）也會把 `hp` 設為 0，直到下一次更新 boss HP 才恢復，頁面會在戰鬥途中誤判為已結束。
- 不採用以 `obTabId` 查遊戲分頁網址：upstream 沒有先例，網址格式未驗證，還要另外監聽分頁變化；spec 也規定資料來源只用 upstream 已存的欄位。

### 「複製目前關卡資訊」的 JSON 格式（05 沿用）

- 欄位依序為 `questId`（字串）、`battleCount`、`bossName`（boss 日文名）、`bossBuffStatuses`（boss buff 與 debuff 的 status 陣列），以 2 個空白縮排，例如 `{ "questId": "305421", "battleCount": 1, "bossName": "…", "bossBuffStatuses": ["4052_1"] }`。
