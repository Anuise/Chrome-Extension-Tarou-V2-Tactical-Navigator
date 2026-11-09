# 04: 解析戰鬥回應產生 tn:battle-state，填進 snapshot（T4a）

**What to build:** tn 自己解析遊戲的 start.json 與行動回應，整理成目前這一場的戰鬥狀態，存在 `tn:battle-state`。側欄的戰鬥腳本頁把它和 upstream 的 `battleInfo`、`battleRecord` 合起來，組出 03 的 `BattleSnapshot`，讓新條件有資料可判斷。這張票只做已確認的欄位；技能冷卻、HP、召喚石冷卻、DC% 等要等 T3 實戰確認後由 T4b 補上。只被動接收，絕不主動發請求。

**Blocked by:** 01、03

**Status:** ready-for-human

- [x] `src/tn/battle-state/parse.ts`：純函式，解析 start.json 與 8 種行動回應
- [x] start.json 重建；同一場重新整理時保留累計值，換場時整份重建
- [x] boss 的個人 buff 改用 start.json 的 `user_id` 過濾
- [x] `src/tn/battle-state/background.ts`：掛在 01 的 `handlers`，寫入串成佇列，每筆都從 storage 讀最新值
- [x] `src/tn/battle-state/store.ts`：側欄用的唯讀 ref
- [x] `src/tn/battle-script/snapshot.ts`：由 `battleInfo`、`battleRecord`、`tn:battle-state` 組出 snapshot，只採用目前這一場的資料
- [x] `node:test`：`parse.test.ts`、`background.test.ts`、`store.test.ts`、`snapshot.test.ts`
- [x] `pnpm tc`、`pnpm bp` 通過；鐵則 grep 沒有命中
- [x] Chromium 冒煙測試（和 05 一起做）
- [ ] 組 B 審查
- [ ] 手動驗證：照下方「手動驗證步驟」，在真正的 Chrome 與遊戲裡確認

## Comments

### 檔案

- `src/tn/battle-state/parse.ts`：`classifyUrl`、`applyStartJson`、`applyActionResult`、`reduceBattleState`。純函式，不依賴 Vue 與 chrome API，不改傳入的 state。
- `src/tn/battle-state/background.ts`：`handleBattleState`（01 的 handler）與寫入佇列。
- `src/tn/battle-state/store.ts`：側欄讀 `tn:battle-state` 的唯讀 `shallowRef`。
- `src/tn/battle-script/snapshot.ts`：`toBattleSnapshot(battleInfo, battleRecord, battleState)`。
- `types/modules/tn.d.ts`：`BattleState`、`BattleStateAlly`、`BattleStateSummon`。
- `src/tn/core/dispatch.ts`：`handlers` 加 `handleBattleState`。
- `src/tn/core/upstream.ts`：只多轉出型別（`BattleRecord`、`Ability`、`AttackResultJson`、`BattleStartJson`、`Buff`、`Condition`），沒有轉出會執行的程式。
- `src/views/sidePanel/views/tn-battle-script/index.vue`：組 snapshot 那一行加上兩個參數，以及 `battleState` 的 import。

### 解析哪些回應（`classifyUrl`）

URL 正則和 upstream `useDataCenter.ts` 相同。

| 回應                                                                                                                                                                  | 種類   | 處理                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------- |
| `/rest/(raid\|multiraid)/start.json`                                                                                                                                  | start  | 重建狀態（見下方「重新整理與換場」）  |
| `summon_result.json`                                                                                                                                                  | summon | 行動回應共通處理，再把該格召喚次數 +1 |
| `group_gauge_action_result.json`（連鎖技能）                                                                                                                          | chain  | 行動回應共通處理，再記為已發動連鎖    |
| `normal_attack_result.json`、`ability_result.json`、`fatal_chain_result.json`、`temporary_item_result.json`、`event_temporary_item_result.json`、`user_recovery.json` | other  | 行動回應共通處理                      |

- 其他 URL 直接略過，不讀也不寫 storage。
- 還沒收到 start.json 時，行動回應一律忽略。
- 沒有 `scenario` 陣列的行動回應（例如錯誤訊息）不更新。
- 行動回應沒有 raid_id，一律套到目前的狀態（同 upstream 以最近一次 start.json 為準）。

### 存什麼（`tn:battle-state`，`BattleState`）

只存目前這一場，單一 key。

| 欄位                    | 內容                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `raidId`、`questId`     | start.json 的 `raid_id`、`quest_id`（字串）                                                                                             |
| `battleCount`           | start.json 的 `battle.count`；沒有時為 1                                                                                                |
| `userId`                | start.json 的 `user_id`，用來過濾 boss 的個人 buff                                                                                      |
| `allies[]`              | 依 `player.param` 的順序（含後排），索引就是 player 索引                                                                                |
| `allies[].id`           | `pid` 底線前的部分                                                                                                                      |
| `allies[].isLeader`     | `Number(leader) === 1`；沒有任何角色帶這個旗標時，第 0 個是主角（依據：Viramate `build/external.js:968`、upstream `useBattleLog.ts:9`） |
| `allies[].buffStatuses` | buff＋debuff 的 status，以 status 去重；buff、debuff 可能是 `null`                                                                      |
| `allies[].abilities[]`  | `{ slot, abilityId }`：`ability[k].pos`（player 索引）對到角色，`list` 的鍵是技能格，`[0]['ability-id']` 是技能 ID                      |
| `formation`             | 前排各格（0 起算）是 `allies` 的第幾個                                                                                                  |
| `summons[]`             | `{ from, id, used }`：`summon[]` 依格號排列（第 1 格是 `main`，其餘是 `sub`），好友召喚 `supporter` 放在最後。空的格子 `id` 是空字串    |
| `chainAbilityIds`       | `group_gauge.ability_list[].ability_id`，依順序（左、右）；目前沒有程式讀，供之後區分 DC 左右                                           |
| `chainUsed`             | 本場發動過連鎖技能                                                                                                                      |
| `bossBuffStatuses`      | 目前主 boss 的 buff＋debuff status（見下方「boss buff」）                                                                               |
| `bossBuffHistory[]`     | `{ turn, statuses }`，每回合一筆                                                                                                        |

- 主 boss 同 upstream：第一隻 HP 不是 0 的 boss。
- 空的召喚格保留在狀態裡，是為了讓 `summon_id` 的格號用索引對得上；snapshot 會濾掉。

### 行動回應的共通處理（`applyActionResult`）

依序：

1. `status.formation` 有帶時更新前排。
2. `status.ability` 有帶時，以 `ability[k].pos` 找角色，覆蓋它的技能格對應。不在這份 `ability` 裡的角色（例如下到後排）保留舊的對應。從後排換上前排的角色，因此也有技能格。
3. scenario 的 `condition` 指令：每個位置取**最後一個**，內容是該對象目前完整的 buff 清單。
   - `to: player`：`pos` 是前排格，用步驟 1 之後的前排對到角色，**整個覆蓋**該角色的 buff；
   - `to: boss`、`pos: 0`：更新 boss buff；其他 boss 位置與 `field_effect` 不處理；
   - scenario 裡夾著的陣列略過。
4. 召喚：`requestData` 的 `summon_id` 是 `supporter`（好友）或 1 起算的格號；格號只在主召、副召裡找。`requestData` 不是字串（例如 `null`）時不計次。
5. 連鎖技能：`chainUsed` 設為 true。
6. `status.turn` 和 `bossBuffHistory` 最後一筆的回合不同時，記下目前的 boss buff。

### boss buff

- buff＋debuff 以 status 去重。
- 帶 `personal_buff_user_id` 或 `personal_debuff_user_id` 的項目，只保留等於自己 `userId` 的；沒有時是 `false`，保留。
- upstream 用 `userInfo.uid` 過濾，但 `uid` 只有去過自己的個人頁才會寫入。沒去過時 `uid` 是空的，帶個人標記的 boss buff 會全部被濾掉。tn 改用 start.json 一定有的 `user_id`。

### 重新整理與換場（`applyStartJson`）

- **換場**（raid_id 和目前狀態不同，或還沒有狀態）：整份重建，召喚次數、`chainUsed`、`bossBuffHistory` 都從零開始。
- **同一場重新整理**（raid_id 相同）：角色、buff、前排、技能格、召喚石 ID、連鎖技能、boss buff、`battleCount` 用 start.json 重建；**保留** start.json 拿不到的召喚次數（同一格、同一張石頭才保留）、`chainUsed`、`bossBuffHistory`。
  - upstream 的 `battleRecord.player[].condition` 重新整理後不會刷新，所以角色 buff 不依賴它。
- 開幕特動：start.json 帶 `scenario`、`status` 時，照行動回應處理（同 upstream）。
- 最後用 start.json 的 `turn` 補一筆回合歷史（這回合已經有一筆時不重複記）。

### 寫入（`background.ts`）

- `handleBattleState` 先用 `classifyUrl` 過濾，無關的回應直接回傳，不碰 storage。
- 寫入串成一條 promise chain：前一筆寫完才處理下一筆。每一筆都先 `chrome.storage.local.get` 讀最新值，算完再 `set`。狀態不放記憶體，service worker 被關掉重開後照樣接上。
- 存成 JSON 字串，和 `useWebExtensionStorage` 的物件格式相同。
- 每一筆自己 `.catch` 並印 `[tn] 戰鬥狀態更新失敗`：佇列是 `queue.then(...)` 串起來的，沒有 catch 的話一筆失敗之後整條佇列都停住。01 的 `dispatchParcel` 也會接 rejection，但 `handleBattleState` 回傳的 Promise 永遠不會 reject。

### 側欄為什麼不用 `useWebExtensionStorage`

`docs/fork/RULES.md` §2 的慣例是 tn 的 storage key 直接用 `useWebExtensionStorage`。`tn:battle-state` 例外，側欄改用 `store.ts` 的唯讀 `shallowRef`：一開始 `chrome.storage.local.get` 一次，之後只聽 `chrome.storage.onChanged` 裡 `local` 區、`tn:battle-state` 這個 key 的變更，從不寫入。

理由：`useWebExtensionStorage`（`src/composables/useWebExtensionStorage.ts:75-125`）第一次讀到值時，會設定 ref 的值，deep watch 因此觸發，把同一個值原樣寫回 storage。background 如果剛好在側欄讀取與寫回之間寫入新的狀態，新狀態會被舊值蓋掉，等於繞過了寫入佇列。只有 background 會寫這個 key，側欄不需要寫入能力。

- 這個例外已經寫進 `docs/fork/RULES.md` §2（組 B 第 1 輪 I17）：只由 background 寫入、側欄只讀的 key 都照這樣做，目前是 `tn:battle-state` 與錄製器的 `tn:rec:index`。
- 掛載時的競態：`get` 送出後、回來之前，`onChanged` 可能先送來更新的狀態。`store.ts` 收到過 `onChanged` 之後就忽略第一次 `get` 的結果，避免舊快照蓋掉新狀態；`get` 失敗時印 `[tn] 讀取戰鬥狀態失敗`。做法和錄製頁相同（組 B 第 1 輪 I4）。

### snapshot 的資料來源（`toBattleSnapshot`）

| snapshot 欄位                                               | 來源                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `questId`、`hpPercent`、`gauge`、`omenText`                 | upstream `battleInfo.bossInfo`（同 03 之前）                                                                     |
| `turn`                                                      | 有目前這一場的 `battleRecord` 時取 `battleRecord.turn`，沒有時才用 `bossInfo.turn`                               |
| `battleCount`                                               | `tn:battle-state`；沒有時 `undefined`                                                                            |
| `bossBuffStatuses`                                          | `tn:battle-state`；沒有時退回 upstream 的 `buffInfo.bossBuffs`；兩者都沒有時 `undefined`                         |
| `allies[].id`、`isLeader`、`buffs`、`abilities` 的格位      | `tn:battle-state`                                                                                                |
| `allies[].front`                                            | `tn:battle-state` 的 `formation`                                                                                 |
| `allies[].dead`                                             | upstream `battleRecord.player` 裡 `pid` 和角色 id 相同的那一位的 `is_dead`；對不到時 `undefined`                 |
| `allies[].abilities[].used`                                 | upstream `actionQueue` 裡 `type: ability`、`id` 是該技能或它的子技能的行動數；沒有 `battleRecord` 時 `undefined` |
| `summons`、`chainUsed`                                      | `tn:battle-state`（空的召喚格不列入）；沒有時 `summons` 為空、`chainUsed` 為 `undefined`                         |
| `history[]` 的 `turn`、`hpAtStart`、`omenText`、`actions`   | upstream `actionQueue`，依序一筆對一筆                                                                           |
| `history[].guards`                                          | `actionQueue[].guard_status` 裡 `is_guard_status` 為真的 `num`，對到 `battleRecord.player[num].pid`              |
| `history[].bossBuffStatuses`                                | `tn:battle-state` 的 `bossBuffHistory` 裡同一回合的那一筆；沒有時 `undefined`                                    |
| `hp`、`hpMax`、`ready`、`recast`、`chain`、`buffs[].remain` | 這次不填（T4b）                                                                                                  |

- 只採用屬於目前這一場的資料：`battleRecord` 取 `raid_id` 等於 `battleInfo.bossInfo.battleId` 的那一筆；`tn:battle-state` 的 `raidId` 不等於它時當作沒有。
- **沒有資料時一律是 `undefined`，不補預設值**（`snapshot-spec.md` 修訂 3，組 B 第 1 輪 I1）。用到這些欄位的 03 條件不成立；腳本寫了 `battleCount`、而 snapshot 的 `battleCount` 是 `undefined` 時，腳本不相符。
- `tn:battle-state` 不屬於目前這一場時：`allies`、`summons` 為空，`chainUsed`、`battleCount` 為 `undefined`，boss buff 退回 upstream 的值；`history` 照常由 `actionQueue` 轉換，只是每一筆的 `bossBuffStatuses` 是 `undefined`。
- 沒有目前這一場的 `battleRecord` 時：`history` 為空，`dead`、技能的 `used` 為 `undefined`，`turn` 改用 `bossInfo.turn`；召喚石的 `used` 照常取自 `tn:battle-state`。
- 子技能：upstream 在 `get_select_if.json`（有「選擇」介面的技能）與 `get_hiddenweapon`（暗器職業的 1 技）的回應裡，把子技能清單填進 `battleRecord.abilityList[].subAbility`，之後 `actionQueue` 記的是子技能的 id。`used` 用 `subAbility` 把子技能的 id 算回母技能（組 B 第 1 輪 I2）。

### 已知限制

- **中途換人**：condition 的 `pos` 用這個回應處理完之後的前排對到角色，和 upstream `useBattleLog.ts:160` 相同。同一個回應裡中途換人時，換人前的 condition 也會對到新的前排（每個位置只取最後一個，通常是換人之後的那個）。
- **回合數**：有目前這一場的 `battleRecord` 時取 `battleRecord.turn`，每個行動回應都會更新。沒有時才用 `bossInfo.turn`，upstream 只在回應有 `boss_gauge` 時更新它，沒打到 boss 的回應之後可能慢一拍。
- **下到後排或戰鬥不能的角色**：buff 只在 condition 指令對到前排位置時更新，所以角色離開前排之後，會保留最後一次在前排時的 buff。腳本對可能下場的角色寫 `ally.buff` 時，加上 `front: true`。腳本 skill 的提醒留給 T7。
- **快速召喚**：召喚次數只在 `summon_result.json` 計次。快速召喚有沒有走 `summon_result`，待 T3 錄檔確認；如果沒有，召喚次數會少算。
- **多段戰**：「同一場保留、換場歸零」的前提是每一段的 `raid_id` 都不同。多段戰的下一段會不會換 `raid_id`，待 T3 錄檔確認。如果不換，下一段的 start.json 會被當成重新整理：召喚次數、`chainUsed`、boss buff 歷史都會保留，upstream 的 `actionQueue` 也會接續上一段。
- **每回合 boss buff 的時間點**：記的是「該回合第一個回應處理完之後」的 boss buff，和 upstream `actionQueue` 記 HP、預兆的時間點一致。
- **防禦**：沿用 upstream 的 `guard_status`。upstream 每回合開始時把所有角色當成沒防禦，回合中按了防禦（`guard_setting.json`）才記；中途才打開側欄或重新整理前按的防禦不會補記。
- **dead**：以 `pid` 對應 `battleRecord.player`，和 upstream 重新整理時的做法相同；找不到目前這一場的 `battleRecord` 或該角色時是 `undefined`。
- **不填的欄位**：`hp`、`hpMax`、技能與召喚石的 `ready`、`recast`、`chain`（DC%）、buff 的 `remain`，留給 T4b。用到它們的 03 條件一律不成立。
- **多個戰鬥分頁**：行動回應沒有 raid_id，同時開兩場時會套到最近一次 start.json 的那一場。
- 還沒在真正的 Chrome 和遊戲裡測過；`leader` 旗標、`summon[]` 的格號對應都是照 upstream 型別與公開資料推定，要靠手動驗證或 T3 的錄檔確認。

### 手動驗證步驟

用 05 的「偵測到的狀態」面板對照遊戲畫面。05 的手動驗證可以一起做。

1. **build 並載入新版**：照 02「手動驗證步驟」的步驟 1。
2. **進一場戰鬥**：在遊戲分頁打開側欄的「戰鬥腳本」頁，展開「偵測到的狀態」。
3. **開場時對照**：
   - 前排角色的角色 ID 和順序，與遊戲畫面上的 4 個人一致；主角那一張的「主角」是「是」；
   - 每個角色的 buff 圖示和遊戲畫面上角色頭像下的圖示一致（圖示右邊的文字就是 status ID）；
   - 召喚石的來源與 ID：主召在第一列，好友在最後一列。
4. **打幾回合後對照**：
   - 按過的技能，該技能格的「用過」次數有增加；
   - 召喚後，該召喚石的「用過」+1；
   - 放 FC 之後的下一回合，「上一回合」的「放 FC」是「是」；
   - 按防禦再攻擊的下一回合，「上一回合」的「防禦」有該角色的 ID；
   - 有角色戰鬥不能、而且還在前排時，該角色的「存活」是「否」。面板只列前排，所以只有隊伍沒有後排，或主角戰鬥不能時才看得到；
   - 前排角色戰鬥不能、後排補上前排之後，「前排角色」換成補上的角色，戰鬥不能的角色不再列出。
5. **重新整理**：在戰鬥中重新整理遊戲頁面，回到側欄：
   - 召喚石的「用過」次數沒有歸零；
   - 「上一回合」仍然有資料；
   - 角色 buff 和遊戲畫面一致（upstream 的戰鬥畫面這時可能還是舊的，以遊戲畫面為準）。
6. **換場**：打下一場（不同關卡），召喚石的「用過」全部回到 0，「發動過連鎖」回到「否」。多段戰的下一段待 T3 確認（見已知限制），先不用這一步驗證。
7. （有機會時）**多人戰的個人 buff**：在有其他玩家的多人戰，boss 身上只顯示自己的個人 buff。可以按「複製目前關卡資訊」，看 `bossBuffStatuses` 有沒有包含別人給 boss 的個人 debuff。

有任何一項不符合，按「複製診斷資料」，連同遊戲畫面的截圖交給主管。

### 鐵則

只被動接收：AJAX 回應從 01 的 `tnUnpack` 進來，側欄只讀 storage。不 `fetch`、不 XHR、不碰遊戲頁面與 `chrome.debugger`，狀態詳情的 condition API 絕不主動去打。`upstream.ts` 這次只多轉出型別。完整規則見 `docs/fork/RULES.md` §5.1。

### 審查

組 B（03＋04＋05）三輪審查。第 1 輪三位審查員都判定「側欄不用 `useWebExtensionStorage`」的理由成立，替代做法正確，只缺掛載競態的保護。和本票有關的修正：

- 第 1 輪：
  - 缺資料時不補預設值，`battleCount`、`chainUsed`、`bossBuffStatuses`、`dead`、`used` 沒有資料時是 `undefined`（I1）；
  - `dead` 改用 pid 對應（I6）；`turn` 優先取 `battleRecord.turn`（I18）；
  - 子技能算進母技能的 `used`（I2）；
  - `store.ts` 的掛載競態與 `.catch`（I4）；
  - 補測試：接線、重新整理換石頭、`requestData` 不存在、`used` 只算 ability、`store.ts`（I5）；
  - `chainAbilityIds` 補註解（I9）；RULES §2 寫進唯讀 key 的例外（I17，主管決定）；
  - 手動驗證與已知限制的修正（I7、I10、I12、I14、I16）。

處理紀錄在 `.claude-team/research/battle-data/reviews/B-fixes-r1.md`（本機）。

### 驗證紀錄

- `node:test`：`src/tn/battle-state/parse.test.ts` 26 個、`background.test.ts` 6 個、`store.test.ts` 4 個、`src/tn/battle-script/snapshot.test.ts` 17 個。`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 257 個全部通過（組 B 第 1 輪修正後）。
- `background.test.ts` 用假的 `chrome.storage.local`（`get`、`set` 都延遲完成），確認連續 3 筆依序處理、無關的 URL 不讀寫、中間一筆失敗不影響後面；另外用 `tnUnpack` 確認 `handleBattleState` 接在 `handlers` 上。
- `store.test.ts` 用假的 `chrome.storage`，每個測試各載入一份新的 `store.ts`：確認只接受 `local` 區與 `tn:battle-state`、`onChanged` 先到時不被晚回來的 `get` 蓋掉、`get` 失敗時印 `[tn]` 錯誤。
- 突變測試：腳本與輸出在 `reviews/smoke-B-r1-fix/mutate_b1fix.*`（本機）。第 1 輪審查員回報沒擋下的突變（C22、W1、P2、P5、S3），以及 `store.ts` 拿掉 area 過濾、key 過濾、競態保護、`.catch`，加上把 I1、I2、I6、I13、I18 改回舊行為，共 25 個，全部有測試失敗。
- `pnpm tc`、`pnpm bp` 通過；鐵則 grep 沒有命中。
- 解析時參考了 public-sources S1（2021 年的真實回應）的結構：`ability` 的鍵是 1 起算的前排格、`pos` 是 0 起算，`list` 的鍵是 1 起算的技能格；scenario 裡夾著陣列；buff、debuff 可能是 `null`。S1 前排沒有換過人，所以 class 字串 `ability-character-num-{c}-{s}` 的 `c` 是前排格還是 player 索引分不出來，一律以 `pos` 為準。
- 冒煙測試：和 05 一起做，見 05 的驗證紀錄。
- 還沒在真正的 Chrome 和遊戲裡驗證。
