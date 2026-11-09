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

- 第 1、2 層可以建立新的一場。`raid_id` 只接受正整數或全數字字串。
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

1. 開側欄的「錄製」頁，**在進入戰鬥前**按「開始錄製」。已經在戰鬥中才開：重新整理戰鬥頁面，可以補錄目前回合的開場資料（start.json），之前回合的回應補不回來。
2. 錄製時只開一個戰鬥分頁。
3. 多人戰的 WebSocket 訊息，要在進入戰鬥時側欄或戰鬥視窗已經開著才錄得到。進戰鬥後才打開側欄的話，重新整理戰鬥頁面。
4. 打完**立刻**在場次清單按該場的「匯出」，然後按「停止錄製」。只保留最近 3 場，多段戰每一段都算一場，忘了停的話很快就會被擠掉。
5. 下載的 `tn-rec-<raidId>-<日期>-<時間>.json` 交給研究者或 Claude。交給 Claude 時，檔案內容會送到模型服務。
6. 不需要時按「全部清除」：刪掉全部錄製資料與索引，保留開關。

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
- **換成 `***`**：
  - key 去掉 `_`、轉小寫後等於 `viewerid`、`nickname`、`username`、`userimage`，以及 URL 的 `viewer_id=`。`viewer_id` 和 `user_id` 是不同的編號體系，不放進代號對照表；
  - 聊天：`chatAdd`、`raidPost`、`raidGet`、`commentData`、`user_comment` 的值整個換掉，不論型別。
- 只換字串與數字；值是陣列時逐一套用同樣的規則，陣列裡的物件照舊往下走訪。`false`、`null` 保持原樣，例如不是個人 buff 時 `personal_buff_user_id` 是 `false`。
- requestData 是 JSON 字串時，解析、處理後再轉回字串，讓格式和 `TnParcel` 一致，T4 可以直接拿來當測試資料。不是 JSON 的字串和 `null` 原樣保留。

### `unlimitedStorage` 的依賴

- manifest 有 `unlimitedStorage`，所以 `chrome.storage.local` 沒有 10 MB 的上限。錄製器最多存 50 MB 就是靠這個權限。
- 沒有這個權限時，storage 只有 10 MB，而且和 upstream 的所有 key 共用。錄一場（約 5～10 MB）就會把配額用完，之後 upstream 的 `battleRecord` 等寫入都會失敗。
- RULES 不准改 manifest（§5）。同步 upstream 時要確認 `manifest.json` 仍有 `unlimitedStorage`，沒有的話先停用錄製器（`docs/fork/RULES.md` §7）。

### 已知限制

- 換場時，新一場的 start.json 還沒到之前收到的 WebSocket 訊框與沒有 raid_id 的 API，會歸到上一場。
- 開著多個戰鬥分頁時，WebSocket 訊框只用 `lastAt` 歸場，可能歸錯。
- 中途才開錄時，之前回合的回應補不回來。
- 遮罩與代號只看 key 名稱：用其他名稱（例如只叫 `id`）裝的玩家資料不會處理。不是 JSON 的 requestData（例如 form 格式的 `user_id=…`）也不處理。
- 「全部清除」為了找出殘留的 key，會用 `get(null)` 把整個 storage 讀進側欄一次。很少用，慢一點可以接受。
- 錄製關閉時，每個戰鬥回應仍會讀一次 storage 檢查開關，成本可以接受。
- service worker 被關掉時，佇列裡還沒寫入的資料會遺失。
- 除了 Chromium 冒煙測試，還沒在真正的 Chrome 和遊戲裡測過。

### 手動驗證步驟（T3 試錄）

正式錄 G100 之前，先做一次試錄：

1. `pnpm bp`，到 `chrome://extensions` 按這個擴充功能的「重新載入」。不要移除後再載入，移除會清掉 `chrome.storage`。重新載入後，重新打開或重新整理遊戲分頁。
2. 開側欄的「錄製」頁，按「開始錄製」，狀態顯示「錄製中」。只開一個戰鬥分頁。
3. 側欄開著，打一場短的 solo raid；再打一場多人戰。兩場都在進入戰鬥前就開錄。
4. 兩場各按一次「匯出」，然後按「停止錄製」。
5. 檢查匯出檔：
   - 沒有出現「有 M 筆讀不到」的提示，`records` 的數量等於 `count`；
   - `questId` 有值；
   - 多人戰那場有 `url` 是 `websocket` 的紀錄；
   - URL 裡是 `uid=self`，start.json 的 `user_id` 是 `"self"`，其他玩家是 `p1`、`p2`…；
   - 搜尋自己的 user ID 數字，應該找不到；
   - 搜尋 `commentData`、`user_comment`、`content`，以及 URL 含 `chat` 的紀錄：如果出現聊天文字，回報給研究者；
   - 場次清單只有打過的那幾場，沒有只有 1～2 筆、「關卡不明」的多餘場次。
6. 都符合後，正式錄 G100：進戰鬥前開錄，打完立刻匯出並停止錄製。多段戰每一段算一場，只保留最近 3 場。

做完後，把本票和 01 的最後一項打勾，Status 改為 `resolved`。

### 鐵則

錄製器只被動接收遊戲自己收發的資料：AJAX 回應從 01 的 `tnUnpack` 進來，WebSocket 訊框從 `chrome.debugger.onEvent` 進來。不 `fetch`、不 XHR、不 attach debugger、不 `sendCommand`，condition API 絕不主動去打。完整規則見 `docs/fork/RULES.md` §5 最後一列。

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

處理紀錄在 `.claude-team/research/battle-data/reviews/A-fixes-r1.md`、`A-fixes-r2.md`（本機）。

### 驗證紀錄

- `node:test`：`src/tn/recorder/core.test.ts` 46 個、`store.test.ts` 11 個；`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 150 個全部通過（組 A 第 2 輪修正後）。
- `store.test.ts` 用假的 `chrome.storage.local`、`chrome.debugger`（只有 `onEvent.addListener`）與會排隊的 `navigator.locks`，並以 `import('./store.ts?ctx=panel')` 載入第二份模組模擬側欄。暫時拿掉 Web Lock、WebSocket 過濾、佇列接錯、`loadRecords` 略過、截斷只寫索引等保護時，對應的測試都會失敗。
- `pnpm tc`、`pnpm bp` 通過。
- 冒煙測試：用 Playwright 在 Chromium 未封裝載入 `dist/`，以本機假頁面餵 `ajaxSuccess`。開關、兩場的歸場與序號、匯出的代號與遮罩、storage 保留原樣、全部清除、停止後不錄，都符合預期。WebSocket 在 headless 測不到，只有單元測試。
- 還沒在真正的 Chrome 和遊戲裡驗證。

尚待使用者：照「手動驗證步驟」做完 T3 試錄（最後一項未勾選）。
