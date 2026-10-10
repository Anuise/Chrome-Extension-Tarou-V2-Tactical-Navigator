# 0003. upstream 檔案只允許白名單內的掛鉤點，並以 `[TN]` 標記

- 狀態：已採納
- 日期：2026-10-10

## 背景

tn 工具需要被 upstream 的程式呼叫才能運作，例如收到遊戲 AJAX、出現在側欄選單。研究報告（`docs/research/architecture.md` §4、§5）顯示：

- 新增功能最常改的位置是 `useDataCenter.ts` 的 `unpack()`（全期間 119 次、近 12 個月 30 次）、`src/logic/storage.ts`（72 / 18）、`types/modules/extension.d.ts`（33 / 33），三者都是衝突熱點。
- 近期穩定的檔案是 `src/background/index.ts`（近 12 個月 0 次）、`src/contentScripts/index.ts`（0 次）、`src/views/sidePanel/main.vue`（7 次）。
- `express` 訊息的 payload 是完整的 `{url, requestData, responseData}`，自有分派器可以完全獨立於 `unpack`。

查證結果（webext-bridge 6.0.1，`node_modules/webext-bridge/dist/chunk-QIZ4XBKF.js`）：`onMessage` 以 `Map.set(messageID, callback)` 儲存 handler，同一個訊息名只保留最後一個。如果 tn 另外呼叫 `onMessage('express', ...)`，upstream 的 `unpack` 會被**靜默取代**。所以研究報告 §7.2 中「另外註冊一個監聽者」的方案不可行。

## 決策

1. 只有下列位置可以修改 upstream 檔案，每處只加 import 與最少的呼叫行：
   - `src/background/index.ts`：在既有 `express` handler 內，`unpack(...)` 之後呼叫 `tnUnpack(...)`；在 listener 清單尾呼叫 `setupTnBackground()`。
   - `src/views/sidePanel/main.vue`：在 `downViewList` 開頭展開 `...tnViewList`。`downViewList` 比 `upViewList` 少被修改。
   - `src/contentScripts/index.ts`：需要 DOM 擷取時呼叫 `setupTnContentScript()`。
   - `AGENTS.md`：尾端一行指標（見 ADR-0004）。
2. 每個掛鉤點加 `[TN]` 標記：單行 `// [TN]` 或 `<!-- [TN] -->`，多行 `// [TN] begin` … `// [TN] end`。
3. 不另外維護修改清單。白名單（`docs/fork/RULES.md` §3）就是清單，實際差異用 `git diff upstream/main...HEAD` 與 `grep -rn "\[TN\]"` 查。
4. 白名單以外的 upstream 檔案：AI 必須先問使用者。同意後，把該位置加進白名單，並另寫 ADR。
5. tn 只透過 `src/tn/core/upstream.ts` import upstream 模組；upstream 的 storage ref 一律唯讀；禁止使用 `~/api`。
6. 訊息協定用另一個 `types/tn-shim.d.ts` 做 module augmentation，不修改 `types/shim.d.ts`。已查證兩者會合併，前提是新檔頂層要有 import。

## 研究報告更正

研究報告寫 `ProtocolMap` 在 `types/global.d.ts`，實際位置是 `types/shim.d.ts`。研究報告原文不修改，以本 ADR 為準。

## 後果

- 同步 upstream 時，可能衝突的 fork 修改只剩白名單上的幾行。
- tn 不能做 combatPanel 元件：combatPanel 元件需要在 `constants/index.ts` 與 `extension.d.ts` 加 key，兩者都是熱點。
- tn popup 只能用預設視窗尺寸，因為自訂尺寸表在 `useUtils.ts`。
- `tnUnpack` 與 `unpack` 共用同一個 handler，所以 `tnUnpack` 必須自行 try/catch，不能影響 `unpack`。
