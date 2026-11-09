# 01: 掛上 tnUnpack 與 setupTnBackground（T1）

**What to build:** 在 upstream 的 background 掛上兩個掛鉤：每個 AJAX 回應在 upstream `unpack` 之後交給 `tnUnpack`，background 啟動時呼叫 `setupTnBackground`。tn 的回應解析與 Chrome 原生事件監聽都從這兩個入口進來，而且錯誤不會影響 upstream。同時把使用者鐵則寫進 `docs/fork/RULES.md`（§5 表格的摘要列與 §5.1）。

**Blocked by:** 無

**Status:** ready-for-human

- [x] `src/background/index.ts` 只加三行，都有 `[TN]` 標記：import、`unpack(...)` 之後的 `tnUnpack(res.data as string)`、`setup*Listener()` 清單尾的 `setupTnBackground()`
- [x] `src/tn/core/dispatch.ts`：`TnParcel`、`TnHandler`、`dispatchParcel`、`tnUnpack`、`setupTnBackground`
- [x] parcel 不是字串時忽略；JSON 壞掉、handler 同步丟錯、handler 回傳的 Promise reject，都只印 `[tn]` 開頭的 log，不往外丟錯
- [x] `setupTnBackground` 的每個 setup 各自 try/catch
- [x] `docs/fork/RULES.md` 加上鐵則：§5 表格的摘要列與 §5.1
- [x] `node:test`：`src/tn/core/dispatch.test.ts`
- [x] `pnpm tc`、`pnpm bp` 通過
- [x] Chromium 冒煙測試：AJAX → background → `tnUnpack` → 錄製器（02）整條路走得通
- [ ] 手動驗證：在真正的 Chrome 與遊戲裡，照 02 的「手動驗證步驟」做完 T3 試錄

## Comments

### 掛鉤位置（`src/background/index.ts`，RULES §3 白名單）

```ts
import { setupTnBackground, tnUnpack } from '~/tn/core/dispatch' // [TN]
// …
onMessage('express', (res) => {
  try {
    unpack(res.data as string)
    tnUnpack(res.data as string) // [TN]
  }
  catch (error) { console.log(String(error)) }
})
// …setup*Listener() 清單最後
setupTnBackground() // [TN]
```

- 不另外呼叫 `onMessage('express', …)`：webext-bridge 6.0.1 每個訊息名只保留一個 handler，第二次呼叫會靜默取代 upstream 的 `unpack`。
- upstream 的 `unpack` 是 async 函式，裡面丟錯只會變成 rejected Promise，不會讓同一筆的 `tnUnpack` 被跳過。

### handler 契約（`dispatch.ts` 的 `handlers` 清單）

- 新的 tn 解析在 `handlers` 加一個 import 和一個項目，型別是 `TnHandler = (parcel: TnParcel) => void | Promise<void>`。
- `TnParcel` 是 `{ url, requestData?, responseData? }`。`requestData` 是 jQuery 的 `settings.data`：
  - POST 是字串；
  - GET 時 jQuery 把它併進 URL 後刪掉，所以這個欄位不存在；
  - 有些請求是 `null`。型別是 `string | null`，用之前先判斷 `typeof === 'string'`。
- **不可修改傳入的 parcel**：同一個物件會依序交給每個 handler，錄製器還會延後寫入。
- **先用 URL 過濾**：每個 AJAX 回應（不只戰鬥）都會呼叫每個 handler，同步的部分要快。
- 非同步錯誤不用自己接：handler 回傳的 Promise reject 時，`dispatchParcel` 會接住並印 `[tn] handler 執行失敗`。同步丟錯也一樣。
- **目前成立的前提**：upstream 的 `unpack` 裡沒有 `await`，所以 handler 被呼叫時，background 記憶體中的 upstream ref（`battleInfo`、`battleRecord`）已經反映這筆回應，但 storage 還沒寫入。T4a 這類要搭配 `battleRecord` 解析的 handler 會依賴這個順序；upstream 之後在 `unpack` 加了 `await`，要重新確認。

### setup 契約（`dispatch.ts` 的 `setups` 清單）

- Chrome 原生事件（`chrome.webRequest`、`chrome.debugger.onEvent` 等）可以多處註冊。tn 的監聽一律寫成一個 setup 函式，加進 `setups`。
- **每個 setup 都要同步註冊監聽，不可 await**：MV3 的 service worker 被關掉後，只有啟動時同步註冊的監聽會被事件喚醒。
- 每個 setup 各自 try/catch（`runSetups`）：一個丟錯只印 `[tn] setup 執行失敗`，不影響 upstream 和其他 setup。`setupTnBackground` 在 service worker 頂層執行，丟錯沒接住的話，整個 background 都會起不來。
- 這層 try/catch **只接得住註冊當下**的錯誤。監聽的 callback 之後才丟的錯要自己接，參考 `setupRecorderWebSocket`：沒接住時 Chrome 只印 `Error in event handler`，沒有 `[tn]` 前綴；async callback 的 reject 會變成 unhandled rejection。

### 鐵則（`docs/fork/RULES.md` §5.1）

- 遊戲伺服器是遊戲營運方的所有主機，包括 `*.granbluefantasy.jp`、`gbf.game.mbga.jp`、遊戲 CDN。唯一的例外是用 `<img>`／`<audio>` 顯示 CDN 上的靜態圖片與音效；用 `fetch`／XHR 抓 CDN 上的任何檔案仍然算主動請求。
- ① 不主動向遊戲伺服器發送任何請求或訊息：`fetch`、XHR、jQuery ajax、注入頁面觸發遊戲 API、經遊戲的 WebSocket 送訊息、重送／修改／攔截／延遲遊戲的請求、用程式重新整理或導覽遊戲分頁；也不可以自己組遊戲 API 的 URL 去抓。
- ② 不呼叫 `chrome.debugger.attach`、`detach`、`sendCommand`（唯讀指令也不行），只監聽 upstream 掛上的 debugger 事件。
- ③ 不修改遊戲頁面，也不在遊戲頁面執行程式：模擬點擊、`dispatchEvent`、改 DOM 或表單值、呼叫遊戲頁面的 JS 函式或改遊戲的 JS 變數、`chrome.scripting.executeScript`、注入 `<script>` 都不行。遊戲頁面的 DOM 一律只讀，要加 tn 自己的顯示元素也要先問使用者。
- tn 經 `src/tn/core/upstream.ts` 引用的 upstream 元件與函式也適用。例如 `createNotification` 帶 `sound` 時會用 `executeScript` 在遊戲頁面播音效，`SkipQuest` 會導覽遊戲分頁。
- 允許的被動來源：`tnUnpack`（AJAX 回應）、`chrome.debugger` 事件監聽（WebSocket 訊框）、`chrome.webRequest` 的非阻擋事件監聽（只看 URL 與狀態）、content script 只讀 DOM、經 `upstream.ts` 唯讀 upstream 的 storage ref。
- **檢查方法**：
  - 跑 `grep -rnE "fetch\(|XMLHttpRequest|\.ajax\(|sendCommand|debugger\.(attach|detach)|executeScript|\$\.(get|post)\(" src/tn src/background/index.ts src/views/sidePanel/views/tn-*`，應該沒有任何命中。
  - 審查時另外看 `src/tn/core/upstream.ts` 的 diff：新增轉出時，要人工確認被轉出的 upstream 程式沒有上述的主動行為（grep 只掃 tn 自己的檔案，查不到 upstream 程式裡的行為）。
- 文字以 RULES 為準，這裡只是摘要。

### 審查

組 A（01＋02）跑三輪審查。和本票有關的修正：

- 第 1 輪：handlers 清單註明不可修改 parcel；鐵則列改成三點，debugger 的指令一律不行。
- 第 2 輪：
  - `setupTnBackground` 加錯誤隔離；
  - handler 型別改成可回傳 Promise，由 `dispatchParcel` 接住 rejection；
  - `requestData` 型別改成 `string | null`；
  - 鐵則列補上「遊戲伺服器」的定義、漏列的主動行為，以及 ② 的理由。
- 第 3 輪：
  - 拆出 `runSetups`，補錯誤隔離與接線測試（`recordParcel`、`setupRecorderWebSocket` 都接上了）；
  - 註明 setup 的 try/catch 只接得住註冊當下的錯誤，以及 handler 依賴「`unpack` 沒有 `await`」的前提；
  - 鐵則從 §5 表格移到 §5.1，遊戲伺服器含 CDN、經 `upstream.ts` 引用的程式也適用、不在遊戲頁面執行程式；
  - 鐵則 grep 改成統一版，加上 `upstream.ts` 的人工檢查。

處理紀錄在 `.claude-team/research/battle-data/reviews/A-fixes-r1.md`～`A-fixes-r3.md`（本機）。

### 驗證紀錄

- `node:test`：`src/tn/core/dispatch.test.ts` 7 個測試，`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 162 個全部通過（組 A 第 3 輪修正後）。
- 接線測試在 `src/tn/recorder/store.test.ts`。暫時把 `recordParcel` 從 `handlers` 拿掉、把 `setupRecorderWebSocket` 從 `setups` 拿掉、拿掉 `runSetups` 的 try/catch，或讓 `setupTnBackground` 不經 `runSetups` 直接呼叫時，對應的測試都會失敗。
- `pnpm tc`、`pnpm bp` 通過。
- 冒煙測試：用 Playwright 在 Chromium 未封裝載入 `dist/`，以本機假頁面餵 `ajaxSuccess`，確認回應經 background 的 `tnUnpack` 交給錄製器並寫入 storage（02 的冒煙情境 1～4）。
- 還沒在真正的 Chrome 和遊戲裡驗證。

尚待使用者：照 02 的「手動驗證步驟」做完 T3 試錄後，把最後一項打勾，Status 改為 `resolved`。
