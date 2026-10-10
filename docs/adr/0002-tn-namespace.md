# 0002. fork 程式碼使用 `tn` 命名空間

- 狀態：已採納
- 日期：2026-10-10

## 背景

upstream 的 47 個 storage key 與全部 webext-bridge 訊息名都是無前綴的扁平字串（`src/logic/storage.ts:12-80`、`docs/research/architecture.md` §2.4）。只要 fork 和 upstream 日後用了同一個名稱，就會共用同一份 storage 或攔截同一則訊息。`src/composables/` 頂層檔案會被 auto-import 成全域識別字，所以函式名也可能和 upstream 相撞。

## 決策

fork 的所有自有識別都使用前綴 `tn`（Tactical Navigator）：

| 對象 | 形式 |
|---|---|
| 程式碼目錄 | `src/tn/core/`、`src/tn/<tool>/` |
| storage key | `tn:<key>`，在 tn 檔案內呼叫 `useWebExtensionStorage`，不加進 `src/logic/storage.ts` |
| webext-bridge 訊息 | `tn:<name>`，宣告在 `types/tn-shim.d.ts` |
| 型別模組 | `types/modules/tn.d.ts`（`declare module 'tn'`） |
| 側欄頁 | `src/views/sidePanel/views/tn-<name>/` |
| popup 元件 | `src/views/popup/components/Tn<Name>.vue` |
| 獨立 HTML entry | `src/views/tn<Name>/` |
| 腳本 | `scripts/tn/` |

`src/tn/` 不在 auto-import 範圍內（已查證：`dirs: [r('src/composables')]` 只掃頂層），一律顯式 import。

已查證：新的 `types/modules/*.d.ts` 不必修改 `types/modules/index.d.ts` 就會被 `vue-tsc` 收錄（`tsconfig.json` 未設 `include`）。新 `src/views/<name>/main.ts` 不必修改 vite 設定就會被 `getEntry()` 收錄。

## 後果

- 新增 tn 程式碼幾乎都是新增檔案，不碰 upstream 檔案。
- storage key 一旦寫入使用者瀏覽器，改前綴就要做資料遷移，所以這個決策難以回頭。
- 前綴與 fork 的產品名脫鉤，日後 fork 改名也不必改前綴。
