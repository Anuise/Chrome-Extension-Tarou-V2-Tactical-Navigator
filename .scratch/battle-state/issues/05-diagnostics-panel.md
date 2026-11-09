# 05: 「偵測到的狀態」面板與複製診斷資料（T6）

**What to build:** 戰鬥腳本頁加一個可收合的「偵測到的狀態」唯讀面板，把 04 組出的 snapshot 顯示出來，玩家可以和遊戲畫面對照，確認資料讀得對；也能分辨規則判斷錯是「資料讀錯」還是「腳本寫錯」。旁邊的「複製診斷資料」按鈕複製和面板一模一樣的內容，方便回報。status ID 用文字顯示，玩家可以直接抄下來寫腳本。只讀，不做任何設定。

**Blocked by:** 03、04

**Status:** ready-for-human

- [x] 戰鬥中，「目前戰鬥」分頁的規則區下方有可收合的「偵測到的狀態」，預設收合
- [x] 顯示第幾場、回合、boss HP%、回合開始 HP%、破壞之力、DC%、發動過連鎖、預兆；boss buff；前排角色；召喚石；上一回合摘要
- [x] 沒有資料的欄位一律顯示「未取得」，不猜值；沒有 tn 狀態或 battleRecord 時，整塊顯示「未取得」
- [x] status 用文字顯示，旁邊用 `<img>` 顯示 CDN 的 buff 圖示
- [x] 「複製診斷資料」複製的 JSON 和面板一致
- [x] 既有的「複製目前關卡資訊」按鈕不動
- [x] `node:test`：`src/tn/battle-script/diagnostics.test.ts`
- [x] `pnpm tc`、`pnpm bp` 通過；鐵則 grep 沒有命中
- [x] Chromium 冒煙測試
- [ ] 組 B 審查
- [ ] 手動驗證：照下方「手動驗證步驟」，在真正的 Chrome 與遊戲裡確認

## Comments

### 檔案

- `src/tn/battle-script/diagnostics.ts`：`toDiagnostics(snapshot)`，產生面板與複製共用的顯示資料。純函式，不依賴 Vue、chrome API 與 upstream。
- `src/views/sidePanel/views/tn-battle-script/DiagnosticsPanel.vue`：面板元件，props 是 `snapshot`。側欄的 glob 只收 `views/*/index.vue`，這個檔不會被當成另一個側欄頁。
- `src/views/sidePanel/views/tn-battle-script/index.vue`：import `DiagnosticsPanel`，放在戰鬥中區塊的規則區下方。
- `src/tn/core/upstream.ts`：轉出 upstream 的 `getBuffIcon`（`src/composables/useImage.ts`）。

### 面板與複製一致的做法

- `toDiagnostics` 一次決定所有顯示用的值：有資料時是原本的數字或文字，布林是「是」「否」，沒有資料是「未取得」，召喚石來源是「主召」「副召」「好友」。
- boss buff、前排角色、召喚石、上一回合沒有資料時，整個欄位是字串「未取得」，不是清單；第一回合的上一回合是「沒有上一回合」。
- 面板只渲染這份資料，不自己再算值；「複製診斷資料」複製 `JSON.stringify(diagnostics, null, 2)`。兩邊用同一份資料，值一定一樣。
- 兩邊只有呈現方式不同：
  - JSON 的 key 是英文（對應 snapshot 的欄位名），面板用中文標籤；
  - 空清單在 JSON 是 `[]`，面板顯示「無」；上一回合的防禦在面板以「、」連接；
  - buff 圖示只在面板上，JSON 沒有圖示網址：`toDiagnostics` 要能在 `node:test` 裡跑，不能 import `upstream.ts`，而且網址只是由 status 組出來的字串。

### 顯示內容

| 區塊      | 項目（JSON key）                                                                                                                              | 沒有資料時                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 戰況      | 第幾場（`battleCount`）                                                                                                                       | 沒有 tn 狀態時「未取得」                                                                                   |
| 戰況      | 回合（`turn`）、boss HP%（`hpPercent`）、回合開始 HP%（`turnStartHp`，`history` 最後一筆的 `hpAtStart`）、破壞之力（`gauge`）、DC%（`chain`） | 「未取得」；回合開始 HP% 在沒有 battleRecord 時也是「未取得」                                              |
| 戰況      | 發動過連鎖（`chainUsed`）                                                                                                                     | 沒有 tn 狀態時「未取得」                                                                                   |
| 戰況      | 預兆（`omen`）                                                                                                                                | 沒有預兆是已知的「沒有」，顯示「無」                                                                       |
| boss buff | status 文字加圖示（`bossBuffs`）                                                                                                              | tn 狀態與 upstream 都沒有時「未取得」；空清單顯示「無」                                                    |
| 前排角色  | 角色 ID、主角、存活、HP（`hp`／`hpMax`）、buff（status 與剩餘回合）、技能（格、技能 ID、用過、可用、冷卻）                                    | 沒有 tn 狀態時整塊「未取得」；沒有 battleRecord 時存活與用過「未取得」；HP、剩餘回合、可用、冷卻「未取得」 |
| 召喚石    | 來源、ID、用過、可用、冷卻                                                                                                                    | 沒有 tn 狀態時整塊「未取得」；可用、冷卻「未取得」                                                         |
| 上一回合  | 回合、放 FC、防禦（角色 ID）、預兆                                                                                                            | 沒有 battleRecord 時整塊「未取得」；第一回合時「沒有上一回合」                                             |

- 只列前排角色，依 player 順序。後排角色不列（這是 T6 的範圍）。
- 判斷「沒有資料」的方式：snapshot 的我方角色、召喚石是空陣列，就表示沒有 tn 狀態（戰鬥中一定有角色與主召）；`history` 是空陣列，就表示沒有 battleRecord（有紀錄時至少有目前回合這一筆）。其餘欄位看 snapshot 的值是不是 `undefined`。
- 目前（04 之後）一定顯示「未取得」的：DC%、角色 HP、buff 剩餘回合、技能與召喚石的可用與冷卻。T4b 補上資料後會自動顯示數值，不用改面板。
- 戰鬥頁上方的「第幾場」（面板外）也一樣，沒有資料時顯示「未取得」。

### buff 圖示

- 用 upstream 的 `getBuffIcon` 組出 CDN 上的圖示網址（`…/sp/ui/icon/status/x64/status_<status>.png`），以 `<img>` 顯示。
- `getBuffIcon` 只用 status 組字串，沒有 `fetch`、不碰遊戲分頁，轉出前已確認（`docs/fork/RULES.md` §5.1）。
- 用 `<img>` 顯示 CDN 上的靜態圖片，是 §5.1 的唯一例外，不算主動請求。

### 限制

- 面板只在「目前戰鬥」分頁、而且有戰鬥資料時出現（和 BossCard 一樣看 `snapshot.questId`）。upstream 戰後不清除戰鬥資料，所以打完之後仍顯示最後一場。
- 「存活」來自 upstream 的 `battleRecord`，以 pid 對應角色；找不到目前這一場的紀錄或該角色時顯示「未取得」。
- 「回合」有目前這一場的 `battleRecord` 時取 `battleRecord.turn`，沒有時才用 `bossInfo.turn`（可能慢一拍，見 04 的已知限制）。
- 面板顯示的是 snapshot，和腳本條件看到的資料相同，但不顯示條件的判斷過程。

### 手動驗證步驟

和 04 的手動驗證一起做。

1. **build 並載入新版**：照 02「手動驗證步驟」的步驟 1。
2. **打開面板**：進一場戰鬥，在遊戲分頁打開側欄的「戰鬥腳本」頁。「目前戰鬥」分頁的規則區下方有「偵測到的狀態」，點一下展開。
3. **看「未取得」**：DC%、每個角色的 HP、每個 buff 的「剩餘」、技能與召喚石的「可用」「冷卻」都是「未取得」。其他欄位都有值，包括第幾場與 boss buff；打過第 2 回合後，「上一回合」也有值。
   - 如果「前排角色」「召喚石」「發動過連鎖」「第幾場」是「未取得」：側欄沒收到這一場的 start.json，例如載入新版外掛之後沒有重新整理遊戲分頁。重新整理遊戲分頁之後再看一次。
4. **對照遊戲畫面**：照 04「手動驗證步驟」的步驟 3、4。
5. **複製診斷資料**：
   1. 按「複製診斷資料」，出現「已複製診斷資料」。
   2. 開記事本貼上，內容是多行的 JSON。
   3. 隨便挑 3 個值（例如回合、某個角色的第一個 buff、好友召喚石的「用過」），確認和面板上顯示的一樣。
   4. 數一下「未取得」的個數，和面板上（不含標題下那行說明）一樣。
6. **既有按鈕**：「複製目前關卡資訊」照常可以用，欄位不變（`questId`、`battleCount`、`bossName`、`bossBuffStatuses`）。
   - `battleCount` 現在是實際的第幾場；沒有 tn 狀態時不輸出這個欄位（04）。
   - `bossBuffStatuses` 已經濾掉別人施加的個人 buff；tn 狀態與 upstream 都沒有 boss buff 的資料時，不輸出這個欄位。

有任何一項不符合，把貼上的內容和遊戲畫面的截圖交給主管。

### 鐵則

面板只讀 snapshot（也就是 storage），不做任何設定、不寫入。buff 圖示只用 `<img>` 顯示 CDN 上的靜態圖片（§5.1 的例外）。不 `fetch`、不 XHR、不碰遊戲頁面與 `chrome.debugger`。完整規則見 `docs/fork/RULES.md` §5.1。

### 審查

組 B（03＋04＋05）三輪審查。和本票有關的修正：

- 第 1 輪：
  - 缺資料時不補預設值：沒有 tn 狀態或 battleRecord 時，第幾場、發動過連鎖、前排角色、召喚石、存活、用過、上一回合顯示「未取得」（I1）；
  - 診斷資料加上第幾場與 boss buff（I13，主管決定）；
  - 「複製目前關卡資訊」的說明改成和現況一致（I11）；
  - RULES §2 補上側欄頁子元件屬於 fork 路徑（I15，主管決定）。

處理紀錄在 `.claude-team/research/battle-data/reviews/B-fixes-r1.md`（本機）。

### 驗證紀錄

- `node:test`：`src/tn/battle-script/diagnostics.test.ts` 8 個（有值、個別欄位沒有值、沒有 tn 狀態、沒有戰鬥紀錄、兩者都沒有、boss buff 空清單、沒有上一回合、上一回合沒有 FC 與預兆）。`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 257 個全部通過（組 B 第 1 輪修正後）。
- `pnpm tc`、`pnpm bp` 通過；鐵則 grep 沒有命中。
- 第 1 輪修正的冒煙測試：複製審查員 b 的 `smoke-B-r1-b/smoke_b1b.py` 再改，腳本與輸出在 `reviews/smoke-B-r1-fix/`（本機）。OK 53、NG 0。
  - 放兩份測試腳本：A 不寫 `battleCount`，B 寫 `battleCount: 2`。在四種情況下確認面板、複製內容與條件：
    - 兩者都有（對照組）：條件照常成立，B 相符；
    - 沒有 tn 狀態：第幾場、發動過連鎖、前排角色、召喚石是「未取得」，用到它們的條件不成立，B 不相符，「複製目前關卡資訊」沒有 `battleCount`；
    - 沒有 battleRecord：存活、用過、回合開始 HP%、上一回合是「未取得」，用到它們的條件不成立；
    - 兩者都沒有：以上全部是「未取得」，B 不相符。
  - 每個情境的複製內容和面板一致，「未取得」個數相同。
  - 面板有第幾場與 boss buff（文字加圖示）。
- 冒煙測試（04、05 一起）：用 Playwright 在 Chromium 未封裝載入 `dist/`，外部網址全部擋掉，在本機假頁面依序餵 start.json、技能、防禦、FC、普攻、召喚、連鎖技能共 7 筆回應。確認：
  - background 寫入 `tn:battle-state`，別人給 boss 的個人 buff 有濾掉；
  - 面板展開後的值和預期相同，DC%、HP、剩餘、可用、冷卻都是「未取得」；
  - 按「複製診斷資料」出現提示，複製的 JSON 等於預期值，每個值都出現在面板上，「未取得」的個數兩邊都是 28；
  - buff 圖示的 `<img>` 網址是 CDN 的 status 圖示（測試環境擋掉外部網址，所以圖示顯示不出來）；
  - 「複製目前關卡資訊」按鈕還在。
- 冒煙腳本、輸出與面板截圖放在 `.claude-team/research/battle-data/reviews/smoke-t6/`（本機，不在 repo）。重跑：`python -I -X utf8 smoke_diagnostics.py <dist 路徑> <輸出資料夾>`。
- 還沒在真正的 Chrome 和遊戲裡驗證。
