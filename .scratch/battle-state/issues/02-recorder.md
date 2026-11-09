# 02: 原始回應錄製器（T2）

**What to build:** 側欄新增「錄製」頁。開啟後，把戰鬥中遊戲自己收發的 API 回應與 WebSocket 訊框原樣存在本機，之後每場可以匯出成 JSON 交給研究者分析。T3 要靠它錄一場實戰，確認技能冷卻、召喚石冷卻、DC 等欄位在現行 V2 戰鬥的格式；T4 也用錄檔當測試資料。只被動接收，絕不主動發請求。

**Blocked by:** 01

**Status:** ready-for-human

- [x] `/rest/(raid|multiraid)/` 的 AJAX 回應都錄（不限 upstream 有處理的那幾支）；WebSocket 只錄 `42` 開頭的接收訊框
- [x] raid_id 依 4 層判定歸場，URL 層不建新場
- [x] 每筆一個 key，加上索引；狀態一律從 storage 讀，service worker 重開後接得上
- [x] 寫入串成一條佇列，並和側欄的「全部清除」共用 Web Lock
- [x] 只保留 3 場、總量 50 MB；超過時刪最久沒有新資料的一場；單場超過上限時截斷
- [x] 側欄頁：開始／停止、場次清單、每場匯出、全部清除、說明文字；匯出與清除失敗時有錯誤提示
- [x] 匯出時玩家 ID 換成代號，暱稱、頭像、聊天換成 `***`；storage 保留原樣
- [x] `RULES` §7 與 `REC_LIMITS` 註明依賴 `unlimitedStorage`
- [x] `node:test`：`src/tn/recorder/core.test.ts`、`store.test.ts`
- [x] `pnpm tc`、`pnpm bp` 通過；鐵則 grep 沒有命中
- [x] Chromium 冒煙測試
- [ ] 手動驗證：照下方「手動驗證步驟」，在真正的 Chrome 與遊戲裡做完 T3 試錄

## Comments

### 檔案

- `src/tn/recorder/core.ts`：純函式（判斷要不要錄、歸場、上限、遮罩與代號、匯出），不依賴 Vue 與 chrome API。
- `src/tn/recorder/store.ts`：`chrome.storage.local` 的讀寫、佇列、WebSocket 監聽。模組頂層不可呼叫 chrome API（`dispatch.test.ts` 會間接 import 它）。
- `src/views/sidePanel/views/tn-recorder/index.vue`：側欄頁；`src/tn/core/views.ts` 加一筆，label「錄製」。
- 掛在 01 的 `handlers`（`recordParcel`）與 `setups`（`setupRecorderWebSocket`）。

### 錄什麼

- AJAX：URL 符合 `/rest/(raid|multiraid)/` 就錄，每筆 `{ t: Date.now(), url, requestData, responseData }`，原樣保存。狀態詳情的 condition API 只在玩家自己點開時才會錄到。
- WebSocket：`chrome.debugger.onEvent` 的 `Network.webSocketFrameReceived`，payload 是字串且以 `42` 開頭時，存 `{ t, url: 'websocket', responseData: <payload 去掉 42 後解析的 JSON> }`。JSON 壞掉時只印 log。
  - debugger 由 upstream 掛上：收到 `/socket/uri/raid` 的那一刻，側欄或戰鬥視窗開著才會 attach。tn 只監聽，不 attach、不送指令。

### 歸到哪一場（raid_id）

依序：

1. 解析後 requestData 的 `raid_id`；
2. responseData 頂層的 `raid_id`；
3. URL 路徑（不含查詢字串）裡第一段 8 位以上的數字，**只能對到索引裡已有的場次**；對不到就跳到第 4 層，不建新場。路徑裡的長數字可能是角色 ID，建新場會把正在錄的場次擠掉；
4. 最近一場：索引裡 `lastAt` 最大的那一場。索引是空的就不錄。

- 第 1、2 層可以建立新的一場。`raid_id` 只接受正整數，或以 1–9 開頭的數字字串（`0`、`0123` 不算）。
- WebSocket 訊框一律走第 4 層。

### 儲存

- 每筆一個 key：`tn:rec:<raidId>:<序號>`，序號從 0 開始。
- 索引 `tn:rec:index`：陣列，依建立順序排列，每場一筆：
  - `raidId`；
  - `questId`：start.json 的 `quest_id`，錄到 start.json 之前沒有；
  - `startedAt`、`lastAt`：開始時間、最後一次收到這場資料的時間（含截斷後略過的）；
  - `count`、`bytes`：筆數與總 bytes。bytes 是 `JSON.stringify` 後的 UTF-8 長度（`TextEncoder`）；
  - `truncated`：是否因上限而截斷。
- 錄製資料直接用 `chrome.storage.local`，不用 `useWebExtensionStorage`：後者每次變動都把整個值重寫。
- 每一筆的紀錄和索引用同一次 `set` 寫入。要刪的舊場次，等新索引寫完才 `remove`，中途被關掉頂多留下沒被索引指到的紀錄（「全部清除」會一併刪掉）。
- 寫入串成一條 promise chain，每個工作再取名為 `tn:rec` 的 Web Lock。側欄頁的「全部清除」也取同一把鎖，才不會在 background 讀完索引、還沒寫回時清掉。
- 狀態不放記憶體：每筆都重新讀開關和索引，service worker 被關掉重開後照樣接上。

### 上限、刪除與截斷（`REC_LIMITS`、`planAppend`）

- 只保留 3 場，總量上限 50 MB。
- 寫入後場數超過 3，或總量超過 50 MB：從 `lastAt` 最小（最久沒收到資料）的那一場開始刪，不刪正在寫入的這一場；`lastAt` 相同時先刪較早開始的。剛好等於上限時不刪。
- 這一場加上這筆就超過 50 MB：標記截斷，這筆不寫，之後也不再錄這一場，只更新索引。
- 新的一場第一筆就超過 50 MB 時，仍然建一筆截斷的索引，也算一個名額。

### 開關

- `tn:rec:enabled`，預設關閉。
- 側欄頁用 `useWebExtensionStorage<boolean>` 存，vueuse 的 `StorageSerializers.boolean` 會存成字串 `'true'`／`'false'`。background 用 `=== 'true'` 判斷。`store.test.ts` 用同一個 serializer 產生值，upstream 改了序列化方式時測試會失敗。

### 用法

1. 在遊戲分頁上打開側欄的「錄製」頁，**在進入戰鬥前**按「開始錄製」。已經在戰鬥中才開：重新整理戰鬥頁面，可以補錄目前回合的開場資料（start.json），之前回合的回應補不回來。
2. 錄製時只開一個戰鬥分頁。
3. 多人戰的 WebSocket 訊息，要在遊戲分頁上打開側欄，而且進入戰鬥時側欄或戰鬥視窗已經開著才錄得到。進戰鬥後才打開側欄的話，重新整理戰鬥頁面。
   - upstream 在側欄打開時，把「目前視窗的作用中分頁」記成要掛 debugger 的分頁；在別的分頁打開側欄，之後會掛到錯的分頁。
4. 打完**立刻**在場次清單按該場的「匯出」，然後按「停止錄製」。只保留最近 3 場，多段戰每一段都算一場，忘了停的話很快就會被擠掉。
5. 下載的 `tn-rec-<raidId>-<日期>-<時間>.json` 交給研究者或 Claude。交給 Claude 時，檔案內容會送到模型服務。
6. 不需要時按「全部清除」：刪掉全部錄製資料與索引，保留開關。
7. 重新載入外掛之後，一定要重新整理遊戲分頁。沒重新整理的話，側欄雖然顯示「錄製中」，但什麼都錄不到，畫面上也沒有任何提示。

場次清單每場顯示關卡（`questId`，沒有時顯示「關卡不明」）、開始時間、筆數、大小、是否「已截斷」，以及 raid_id。

### 匯出、遮罩與代號（`buildExport`）

- 檔名 `tn-rec-<raidId>-YYYYMMDD-HHmmss.json`（本機時間）。內容是索引欄位加上 `records`，不縮排、結尾換行。
- 讀不到的序號略過，匯出後提示「已匯出 N 筆，有 M 筆讀不到」。
- 只在匯出時處理，storage 裡保留原樣。
- **玩家 ID 換成代號**：
  - 自己的 ID：這場任一筆紀錄 URL 的 `uid=`，找不到時用 start.json 回應的 `user_id`；都沒有就沒有 `self`。
  - 換代號的範圍：key 去掉 `_`、轉小寫後**包含** `userid` 或等於 `uid`（例如 `user_id`、`userId`、`personal_buff_user_id`、`user_ids`、`member_user_id_list`），以及 URL 查詢參數 `uid=`、`user_id=`。
  - 自己是 `self`，其他人依第一次出現的順序是 `p1`、`p2`…。同一個值在整個匯出檔用同一個代號，比對時轉成字串（`123` 和 `"123"` 是同一人）。代號只在同一個檔案內固定。
  - 出現順序：照紀錄順序，每筆先 URL、再 requestData、最後 responseData，物件依 key 的順序深度優先。
- **換成 `\***`\*\*：
  - key 去掉 `_`、轉小寫後**包含** `viewerid`、`nickname`、`username`、`userimage`（例如 `called_user_name`、`host_nickname`、`owner_viewer_id`），以及 URL 的 `viewer_id=`。`viewer_id` 和 `user_id` 是不同的編號體系，不放進代號對照表。`nickname_color` 這類 key 也會被換掉，對戰鬥分析沒有影響；
  - 聊天：`chatAdd`、`raidPost`、`raidGet`、`commentData`、`user_comment` 的值整個換掉，不論型別。
- 只換字串與數字；值是陣列時逐一套用同樣的規則，陣列裡的物件照舊往下走訪。`false`、`null` 保持原樣，例如不是個人 buff 時 `personal_buff_user_id` 是 `false`。
- ID 欄位（含 URL 的 `uid=`、`user_id=`）的值是 `0`、`""`、`"0"` 時原樣保留，不編成代號：它們表示「沒有」，不是個人資料。
- requestData、responseData 是字串時，能解析成 JSON 就解析、處理後再轉回字串，讓格式和 `TnParcel` 一致，T4 可以直接拿來當測試資料。不是 JSON 的字串（例如 HTML）和 `null` 原樣保留。

### `unlimitedStorage` 的依賴

- manifest 有 `unlimitedStorage`，所以 `chrome.storage.local` 沒有 10 MB 的上限。錄製器最多存 50 MB 就是靠這個權限。
- 沒有這個權限時，storage 只有 10 MB，而且和 upstream 的所有 key 共用。錄一場（約 5～10 MB）就會把配額用完，之後 upstream 的 `battleRecord` 等寫入都會失敗。
- RULES 不准改 manifest（§5）。同步 upstream 時要確認 `manifest.json` 仍有 `unlimitedStorage`（`docs/fork/RULES.md` §7）。沒有的話：
  1. 停下來問使用者；
  2. 使用者決定之前，先從 `src/tn/core/dispatch.ts` 拿掉 `recordParcel`（`handlers`）與 `setupRecorderWebSocket`（`setups`）；
  3. 請使用者在載入新版之前，先在舊版的「錄製」頁按「全部清除」。只停用錄製器不夠：既有的錄製資料最多 50 MB，配額降回 10 MB 後直接超額，upstream 的寫入仍會失敗。

### 已知限制

- 換場時，新一場的 start.json 還沒到之前收到的 WebSocket 訊框與沒有 raid_id 的 API，會歸到上一場。
- 開著多個戰鬥分頁時，WebSocket 訊框只用 `lastAt` 歸場，可能歸錯。
- 中途才開錄時，之前回合的回應補不回來。
- 遮罩與代號只看 key 名稱：用其他名稱（例如只叫 `id`）裝的玩家資料不會處理。不是 JSON 的字串也不處理：requestData 是 form 格式（`user_id=…`）時，或 responseData 是 HTML、URL 編碼的 HTML（例如 `{ "data": "%3Cdiv…" }` 這種字串欄位）時，裡面的玩家資料會原樣匯出。
- 「全部清除」為了找出殘留的 key，會用 `get(null)` 把整個 storage 讀進側欄一次。很少用，慢一點可以接受。
- 錄製關閉時，每個戰鬥回應與 WebSocket 訊框仍會讀一次 storage 檢查開關（WebSocket 訊框還會先解析 JSON），成本可以接受。
- service worker 被關掉時，佇列裡還沒寫入的資料會遺失。
- 除了 Chromium 冒煙測試，還沒在真正的 Chrome 和遊戲裡測過。

### 手動驗證步驟（T3 試錄）

正式錄之前，先做一次試錄，確認錄製器在你的 Chrome 上真的錄得到。

1. **build 並載入新版**
   1. 用主管交給你的那個 checkout（`chrome://extensions` 上這個擴充功能顯示的資料夾，就是它底下的 `dist`），切到主管通知的最終分支。
   2. 在那個資料夾開 PowerShell，執行：

      ```powershell
      corepack pnpm install
      corepack pnpm bp
      ```

      要加 `corepack`：直接打 `pnpm` 會用到全域的舊版 pnpm，出現 `ERROR packages field missing or empty`，build 不起來。

   3. 到 `chrome://extensions`：
      - 已經載入過這個擴充功能：按卡片上的「重新載入」（圓形箭頭）。不要移除後再載入，移除會清掉 `chrome.storage` 裡的資料。
      - 還沒載入過：打開右上角的「開發人員模式」，按「載入未封裝項目」，選那個資料夾底下的 `dist`。
   4. **重新整理遊戲分頁**（或關掉後重開）。這一步一定要做：沒重新整理的話，側欄雖然顯示「錄製中」，但什麼都錄不到，畫面上也沒有任何提示。

2. **打開「錄製」頁並開始錄製**
   1. 在遊戲分頁上，按瀏覽器工具列上這個擴充功能的圖示，打開側欄。不在遊戲分頁時會跳出「请在游戏页面进行操作」的通知。
   2. 側欄右邊有一排直排的圖示，下方那一組的第 2 個實心圓點就是「錄製」。名稱要把滑鼠停在圖示上 1 秒才會出現。看不到這個圖示，表示載入的還是舊版，回到步驟 1。
   3. 按「開始錄製」，旁邊顯示「錄製中」。
   4. 錄製時只開一個戰鬥分頁。
3. **打兩場短的戰鬥**（兩場之間不用按停止，錄製一直開著）
   1. 先打一場短的單人戰鬥：任何關卡都可以，不必是光屬性 solo（遊戲網址是 `#raid/…`）。
   2. 再打一場多人戰（遊戲網址是 `#raid_multi/…`）。最好選有其他玩家的，例如去救援別人的戰鬥；只有自己的話，步驟 5 的 `p1` 那一項跳過。
   3. 多人戰開始時，瀏覽器上方如果出現「…已開始對這個瀏覽器進行偵錯」之類的提示列，**不要按「取消」**。那是 upstream 用來接收 WebSocket 的，按了就錄不到。
4. **匯出並停止**
   1. 場次清單裡兩場各按一次「匯出」。
   2. 「已匯出 N 筆」的提示不代表檔案已經存好。按 `Ctrl+J` 打開瀏覽器的下載清單，確認兩個 `tn-rec-…json` 都在。
   3. 按「停止錄製」，旁邊變成「未錄製」。
5. **檢查**
   1. 側欄上就能看的：
      - 每次匯出的提示「已匯出 N 筆」，N 等於場次清單上那一場的「N 筆」，而且沒有出現「有 M 筆讀不到」；
      - 兩場的卡片都顯示「關卡 <數字>」，不是「關卡不明」；
      - 場次清單只有剛打的兩場，沒有只有 1～2 筆、「關卡不明」的多餘場次。
   2. 打開檔案檢查：匯出檔整個只有一行，而且很長，這是正常的。用記事本打開，或把檔案拖進 Chrome 的新分頁，再用 `Ctrl+F` 搜尋下面的字串：

      | 搜尋                                                            | 預期                                                                                                       |
      | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
      | `uid=`                                                          | 每一個找到的後面都是 `self`                                                                                |
      | 自己的 user ID 數字（遊戲「プロフィール」頁上的 ID）            | 找不到                                                                                                     |
      | `"url":"websocket"`                                             | 多人戰那一場找得到                                                                                         |
      | `commentData`、`user_comment`、`chatAdd`、`raidPost`、`raidGet` | 找不到，或找到時後面緊接的是 `"***"`（例如 `"commentData":"***"`）；後面是別的文字（例如真正的發言）就回報 |
      | `"p1"`                                                          | 只有自己的戰鬥（例如光屬性 solo）找不到，這是正常的；有其他玩家的多人戰找得到                              |

   有任何一項不符合，先不要正式錄，把情況和匯出檔交給主管。

6. **正式錄（spec 的 T3）**
   1. 先按「全部清除」，清掉試錄的兩場。
   2. 正式錄 1～2 場光屬性 solo，最好破壊神意、再生神意各一場，每場整場錄完。進入戰鬥前就要是「錄製中」。
   3. 每場打完立刻匯出，在下載清單確認檔案存好，再按「停止錄製」。多段戰每一段都算一場，只保留最近 3 場，忘了停很快就會被擠掉。
   4. 匯出檔交給主管：告訴主管檔案在下載資料夾裡的完整路徑。主管另外指定放哪裡時，照主管的說明。

做完後，把本票和 01 的最後一項打勾，Status 改為 `resolved`。

### 鐵則

錄製器只被動接收遊戲自己收發的資料：AJAX 回應從 01 的 `tnUnpack` 進來，WebSocket 訊框從 `chrome.debugger.onEvent` 進來。不 `fetch`、不 XHR、不 attach debugger、不 `sendCommand`，condition API 絕不主動去打。完整規則見 `docs/fork/RULES.md` §5.1。

### 審查

組 A（01＋02）跑三輪審查。和本票有關的修正：

- 第 1 輪：
  - URL 層不建新場；
  - 改成依 `lastAt` 刪場；
  - 擴大遮罩範圍；
  - 補 `store.test.ts`；
  - 補說明文字與錯誤提示；
  - 修正 requestData 為 `null` 時匯出變成 `"null"` 的問題。
- 第 2 輪：
  - 補 WebSocket、佇列恢復、Web Lock、`loadRecords`、截斷的測試，並暫時拿掉保護，確認測試會失敗；
  - 補遮罩缺口（陣列值、`commentData`、URL 的 `user_id=`）；
  - 玩家 ID 改用代號；
  - 註明 `unlimitedStorage` 依賴；
  - 補說明文字。
- 第 3 輪：
  - `unlimitedStorage` 不在時改成停下來問使用者、先拿掉錄製器、請使用者先清除；
  - 名稱類 key 改用包含比對，字串型的 JSON 也處理，ID 的 `0`、`""`、`"0"` 保留；
  - 補 bytes、`REC_LIMITS`、剛好等於上限、不可變、`loadIndex` 的測試；
  - 錄製頁掛載時不讓舊索引蓋掉新索引；
  - 「手動驗證步驟」改寫成使用者照著做得出來的版本，側欄說明補重新載入與遊戲分頁的提醒；
  - 待確認的欄位清單移進 repo（`fields.md`）。

處理紀錄在 `.claude-team/research/battle-data/reviews/A-fixes-r1.md`～`A-fixes-r3.md`（本機）。

### 驗證紀錄

- `node:test`：`src/tn/recorder/core.test.ts` 52 個、`store.test.ts` 15 個；`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 162 個全部通過（組 A 第 3 輪修正後）。
- `store.test.ts` 用假的 `chrome.storage.local`、`chrome.debugger`（只有 `onEvent.addListener`）與會排隊的 `navigator.locks`，並以 `import('./store.ts?ctx=panel')` 載入第二份模組模擬側欄。暫時拿掉 Web Lock、WebSocket 過濾、佇列接錯、`loadRecords` 略過、截斷只寫索引等保護時，對應的測試都會失敗。第 3 輪另外確認：bytes 改成字串長度、上限改成 500 MB、截斷的 `>` 改成 `>=`、`planAppend` 直接改傳入的 entry、`loadIndex` 拿掉 `?? []` 時，也都有測試失敗。
- `pnpm tc`、`pnpm bp` 通過。
- 冒煙測試：用 Playwright 在 Chromium 未封裝載入 `dist/`，以本機假頁面餵 `ajaxSuccess`。開關、兩場的歸場與序號、匯出的代號與遮罩、storage 保留原樣、全部清除、停止後不錄，都符合預期。WebSocket 在 headless 測不到，只有單元測試。
- 還沒在真正的 Chrome 和遊戲裡驗證。

尚待使用者：照「手動驗證步驟」做完 T3 試錄（最後一項未勾選）。
