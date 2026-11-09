# 03: 戰鬥腳本的新條件與 snapshot 介面（T5）

**What to build:** 戰鬥腳本的 `when` 加上新條件，讓腳本能寫「上一回合放過 FC」「主角身上有 7 層以上的某 buff」「好友宙斯還沒召喚過」這類規則，不用玩家自己看畫面。`BattleSnapshot` 同時擴充成能放角色、召喚石、連鎖與每回合歷史。全部是選填欄位，不升 schema 版號，舊腳本照常通過。資料由 04 填進 snapshot。

**Blocked by:** 無

**Status:** ready-for-human

- [x] `BattleSnapshot` 新增 `allies`、`summons`、`chain`、`chainUsed`、`history`，既有欄位不變
- [x] 新條件：`omen` 的 `{n}` 與 `omenNum`、`not`、`ally`、`ability`、`summon`、`chain`、`chainUsed`、`lastTurn`、`seenOmen`、`turnStartHp`
- [x] `validateScript`：新欄位的型別、必要欄位、互相依賴與空值都報錯，錯誤路徑照既有格式
- [x] 子型別寫在 `types/modules/tn.d.ts`：`BattleScriptAllyCondition`、`BattleScriptAbilityCondition`、`BattleScriptSummonCondition`、`BattleScriptLastTurnCondition`
- [x] `node:test`：`src/tn/battle-script/core.test.ts`
- [x] `pnpm tc`、`pnpm bp` 通過；三份 `battle-scripts/*.json` 仍通過驗證
- [ ] 組 B 審查
- [ ] 手動驗證：照下方「手動驗證步驟」，在真正的 Chrome 與遊戲裡確認

## Comments

### 檔案

- `src/tn/battle-script/core.ts`：`BattleSnapshot` 介面、`validateScript`、條件判斷（`holds`）。維持純 TypeScript，不 import Vue、chrome API 與 upstream 型別。
- `types/modules/tn.d.ts`：`BattleScriptCondition` 與四個子型別。
- 規格原文在 `.claude-team/research/battle-data/snapshot-spec.md`（本機，含修訂 1、2）。本票摘要成使用者與審查員需要的部分。

### `BattleSnapshot` 新增的欄位

| 欄位                         | 意思                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `allies[]`                   | 我方角色，依 start.json `player.param` 的順序（含後排）；沒有資料時為空陣列                                |
| `allies[].id`                | pid 底線前的部分；角色是角色 ID（例：尤妮 `3040390000`）                                                   |
| `allies[].isLeader`          | 主角                                                                                                       |
| `allies[].front`、`dead`     | 在前排、戰鬥不能                                                                                           |
| `allies[].hp`、`hpMax`       | 角色 HP；拿不到時 `undefined`                                                                              |
| `allies[].buffs[]`           | `{ status, remain? }`；`remain` 只有拿得到剩餘回合時才有                                                   |
| `allies[].abilities[]`       | `{ slot, abilityId, ready?, recast?, used }`；`slot` 1 起算，`used` 是本場用過幾次                         |
| `summons[]`                  | `{ from, id, ready?, recast?, used }`；`from` 是 `main`、`sub` 或 `friend`                                 |
| `chain`                      | 連鎖條（DC）百分比；拿不到時 `undefined`                                                                   |
| `chainUsed`                  | 本場是否發動過連鎖技能                                                                                     |
| `history[]`                  | 每回合一筆，依回合遞增，**最後一筆是目前回合**                                                             |
| `history[].hpAtStart`        | 回合開始時的 boss HP%                                                                                      |
| `history[].omenText`         | 回合開始時的預兆文字，多個以 `\|` 連接                                                                     |
| `history[].bossBuffStatuses` | 回合開始時的 boss buff；tn 沒記到時 `undefined`                                                            |
| `history[].guards`           | 這回合防禦的角色 id                                                                                        |
| `history[].actions[]`        | `{ type, id? }`，這回合依序做的事；`type` 沿用 upstream：`ability`、`fc`、`summon`、`attack`、`temporary`… |

### 條件的通則

- 全部是選填欄位。寫了的全部成立，規則才成立（AND），和既有條件一樣。
- **沒有值時不成立**：snapshot 裡對應的值是 `undefined`，或找不到對象（角色、技能格、召喚石、上一回合）時，該條件不成立。被 `not` 包住時則反過來成立，這是預期行為。
- 區間沿用 `BattleScriptRange`：`[a, b]` 兩端都包含，端點順序不限。
- `who`：寫 `"主角"` 時對到 `isLeader` 的角色，其他字串對到 `id` 相同的角色。

### 各條件

| 條件              | 寫法（例）                                                               | 成立條件                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `omen` 的 `{n}`   | `{ "omen": "{n}ヒット" }`                                                | `{n}` 代表一個數字（以數字開頭，可含逗號）。對 `omenText` 以 `\|` 切開的每一段比對，任一段符合即成立。沒有 `{n}` 時和以前一樣是整串的子字串比對         |
| `omenNum`         | `{ "omen": "{n}ヒット", "omenNum": [0, 40] }`                            | `{n}` 取到的數字（去掉逗號）落在區間內。例：`"{n}ダメージ"` 對 `"100,000,000ダメージ"` 取到 100000000                                                   |
| `not`             | `{ "not": { "bossBuff": "4055_1" } }`                                    | 裡面的條件不成立；可以巢狀                                                                                                                              |
| `ally`            | `{ "ally": { "who": "3040390000", "buff": "7349_", "stack": [7, 10] } }` | 找得到角色；`dead`、`front` 有寫的都相等；有寫 `buff` 時，存在一個 status 以 `buff` 開頭的 buff，而且**同一個** buff 滿足 `stack`、`remain`（有寫的話） |
| `ally.stack`      | `"buff": "7349"` 對 `"7349_7"`                                           | status 去掉 `buff` 前綴與開頭的一個 `_`，取開頭的連續數字（上例取到 7）。取不到數字時視為沒有值                                                         |
| `ability`         | `{ "ability": { "who": "主角", "slot": 1, "used": [1, 99] } }`           | 找得到角色與技能格；`ready` 要和 snapshot 相等（snapshot 是 `undefined` 時不論寫 true 或 false 都不成立）；`recast`、`used` 落在區間內                  |
| `summon`          | `{ "summon": { "id": "2040080000", "from": "friend", "used": [0, 0] } }` | 符合 `id`（與 `from`）的召喚石可能不只一張（例如主召和好友都是宙斯），**任一張**滿足全部有寫的欄位即成立。`ready`、`recast`、`used` 同 `ability`        |
| `chain`           | `{ "chain": [77, 100] }`                                                 | `snapshot.chain` 落在區間內                                                                                                                             |
| `chainUsed`       | `{ "chainUsed": true }`                                                  | 和 `snapshot.chainUsed` 相等                                                                                                                            |
| `lastTurn`        | `{ "lastTurn": { "fc": true } }`                                         | 看 `history` 的倒數第二筆（上一回合），沒有上一回合時不成立                                                                                             |
| `lastTurn.fc`     | `{ "fc": false }`                                                        | 上一回合有沒有 `type: 'fc'` 的行動，要和寫的值相等                                                                                                      |
| `lastTurn.guard`  | `{ "guard": "主角" }`                                                    | 該角色在上一回合的 `guards` 裡                                                                                                                          |
| `lastTurn.attack` | `{ "attack": "3040617000" }`                                             | 上一回合有 `type: 'attack'` 的行動，而且該角色**不在** `guards` 裡                                                                                      |
| `lastTurn.omen`   | `{ "omen": "フェイタルチェイン" }`                                       | 上一回合的 `omenText` 含這個子字串（不支援 `{n}`）                                                                                                      |
| `seenOmen`        | `{ "seenOmen": "アビダメ" }`                                             | `history` 任一筆的 `omenText`，或目前的 `omenText`，含這個子字串                                                                                        |
| `turnStartHp`     | `{ "turnStartHp": [15, 16] }`                                            | `history` 最後一筆的 `hpAtStart` 落在區間內                                                                                                             |

- `ally`、`ability`、`summon` 可以寫成陣列，每一項都要成立。
- `lastTurn.guard`、`lastTurn.attack` 的 `who` 先在**目前的** `allies` 找出角色 id，再查上一回合的 `guards`；對不到角色時不成立。

### 驗證規則（`validateScript`）

- 未知欄位一律報錯，巢狀物件也一樣。
- 字串欄位不能是空字串；布林欄位必須是 boolean；區間必須是兩個數字。
- 以下是驗證錯誤：
  - `omenNum` 沒有 `omen`，或 `omen` 裡沒有 `{n}`：錯誤報在 `when.omenNum`；
  - `omen` 裡的 `{n}` 超過一個：錯誤報在 `when.omen`；
  - `not` 是空物件（空物件恆成立，加上 `not` 之後恆不成立，幾乎一定是寫錯）；
  - `ally`、`ability`、`summon` 是空陣列（至少要有一項）；
  - `lastTurn` 是空物件（至少要寫一個欄位）；
  - `ally.stack`、`ally.remain` 沒有和 `buff` 一起寫；
  - `ability` 缺 `who` 或 `slot`，`slot` 不是 1–4 的整數；`summon` 缺 `id`，`from` 不是 `main`、`sub`、`friend`。
- 錯誤路徑照既有格式，例：`rules[3].when.ally[1].stack`、`rules[3].when.not.ability.slot`。
- 版號維持 1。

### 限制

- 目前（04 之後）snapshot 一律沒有值的欄位：`allies[].hp`、`hpMax`、`abilities[].ready`、`recast`、`summons[].ready`、`recast`、`chain`、`buffs[].remain`。用到它們的條件**一律不成立**（被 `not` 包住時一律成立），要等 T4b 確認現行格式後才會有值。
- `stack` 的取法是通則，status 底線後的數字不一定是層數：依 status 的基礎 ID 而定，也可能是 Lv、百分比或剩餘回合，要逐個 ID 確認後再寫。
- `lastTurn.attack` 只看上一回合有沒有普攻、該角色有沒有防禦，不知道該角色實際有沒有出手（例如戰鬥不能或被麻痺）。
- 沒有新增「DC 判斷式」這類算式條件，用 `chain` 加 `hp` 拆成幾條區間規則。

### 手動驗證步驟

做 05 的手動驗證時一起做比較省事：這裡的 `summon` 規則要用到 05 面板上的召喚石 ID。

1. **build 並載入新版**：照 02「手動驗證步驟」的步驟 1。
2. **驗證錯誤**：用記事本存一個 `tn-test-invalid.json`，內容如下：

   ```json
   {
     "version": 1,
     "name": "驗證錯誤測試",
     "questId": "1",
     "rules": [
       { "note": "a", "when": { "omenNum": [0, 10] }, "advice": [] },
       { "note": "b", "when": { "not": {} }, "advice": [] },
       { "note": "c", "when": { "ally": [] }, "advice": [] },
       { "note": "d", "when": { "ability": { "who": "主角", "slot": 5 } }, "advice": [] },
       { "note": "e", "when": { "lastTurn": {} }, "advice": [] },
       { "note": "f", "when": { "ally": { "who": "主角", "stack": [1, 2] } }, "advice": [] }
     ]
   }
   ```

   到側欄「戰鬥腳本」頁的「腳本管理」分頁，按「匯入戰鬥腳本」選這個檔。預期出現「匯入失敗：tn-test-invalid.json」，底下列出這 6 行：

   ```text
   rules[0].when.omenNum：必須和含 {n} 的 omen 一起寫
   rules[1].when.not：不能是空物件
   rules[2].when.ally：至少要有一項
   rules[3].when.ability.slot：必須是 1–4 的整數
   rules[4].when.lastTurn：至少要寫一個欄位
   rules[5].when.ally.stack：必須和 buff 一起寫
   ```

3. **條件判斷**：進一場戰鬥，記下「目前戰鬥」分頁上「關卡」的數字。打開 05 的「偵測到的狀態」，記下好友召喚石的 ID。存一個 `tn-test-conditions.json`，把 `<關卡>`、`<好友召喚 ID>` 換成剛才記下的值：

   ```json
   {
     "version": 1,
     "name": "條件測試",
     "questId": "<關卡>",
     "rules": [
       { "note": "A 主角在前排（一直成立）", "when": { "ally": { "who": "主角", "front": true } }, "advice": [] },
       { "note": "B 上一回合放過 FC", "when": { "lastTurn": { "fc": true } }, "advice": [] },
       { "note": "C 上一回合主角防禦", "when": { "lastTurn": { "guard": "主角" } }, "advice": [] },
       { "note": "D 主角 1 技本場用過 1 次以上", "when": { "ability": { "who": "主角", "slot": 1, "used": [1, 99] } }, "advice": [] },
       { "note": "E 好友召喚用過", "when": { "summon": { "id": "<好友召喚 ID>", "from": "friend", "used": [1, 99] } }, "advice": [] },
       { "note": "F 目前預兆含數字", "when": { "omen": "{n}" }, "advice": [] },
       { "note": "G 不是第 1 回合", "when": { "not": { "turn": 1 } }, "advice": [] },
       { "note": "H 主角 1 技能按（目前一定不出現）", "when": { "ability": { "who": "主角", "slot": 1, "ready": true } }, "advice": [] }
     ]
   }
   ```

   匯入後回到「目前戰鬥」分頁，一邊打一邊對照：

   | 規則 | 什麼時候應該出現                          |
   | ---- | ----------------------------------------- |
   | A    | 一直出現                                  |
   | B    | 放 FC 的下一回合出現，再下一回合消失      |
   | C    | 主角防禦後按攻擊，下一回合出現            |
   | D    | 按過主角 1 技之後一直出現                 |
   | E    | 召喚好友召喚石之後一直出現                |
   | F    | 遊戲畫面 boss HP 條上方的預兆有數字時出現 |
   | G    | 第 2 回合起一直出現                       |
   | H    | 一直不出現（能不能按要等 T4b）            |

4. 測完到「腳本管理」把這兩份測試腳本刪掉。

有任何一項不符合，把「複製診斷資料」的內容和狀況交給主管。

### 鐵則

條件判斷只讀 snapshot，snapshot 只讀 storage（upstream 的 `battleInfo`、`battleRecord` 與 04 的 `tn:battle-state`）。不 `fetch`、不 XHR、不碰遊戲頁面與 `chrome.debugger`。完整規則見 `docs/fork/RULES.md` §5.1。

### 審查

組 B（03＋04＋05）審查前。審查結論之後補在這裡，處理紀錄放 `.claude-team/research/battle-data/reviews/`（本機）。

### 驗證紀錄

- `node:test`：`src/tn/battle-script/core.test.ts` 67 個。`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 240 個全部通過（05 完成時）。
- `pnpm tc`、`pnpm bp` 通過；`npx tsx scripts/tn/validate-battle-script.ts battle-scripts/*.json` 三份都通過。
- 條件判斷只有單元測試，Chromium 冒煙測試（見 05）沒有測。`snapshot.test.ts` 另有一個測試，用 04 組出的 snapshot 讓 8 條新條件的規則成立，`ability.ready` 的規則不成立。
- 還沒在真正的 Chrome 和遊戲裡驗證。
