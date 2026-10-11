# CONTEXT

本 repo 是碧藍幻想 Chrome 擴充功能 Tarou 的 fork。本檔定義 fork 開發時使用的專有名詞。規則見 `docs/fork/RULES.md`，決策見 `docs/adr/`。

## Fork 結構

**upstream**
原作者的 repo `Waaatanuki/Chrome-Extension-Tarou`，git remote 名稱為 `upstream`，追蹤分支為 `upstream/main`。
_避免_：原版、主線、上游 repo（以免與 `main` 分支混淆）

**fork**
本 repo `Anuise/Chrome-Extension-Tarou-V2-Tactical-Navigator`，git remote 名稱為 `origin`。`main` 分支同時包含 upstream 全部內容與 fork 程式碼。

**upstream 檔案**
存在於 `upstream/main` 的檔案。fork 原則上不修改；只有列入掛鉤點白名單的檔案可以修改。

**fork 路徑**
fork 擁有、可自由新增或修改的路徑，例如 `src/tn/`、`tn-*` 頁面、`CONTEXT.md`、`docs/`。完整清單見 `docs/fork/RULES.md` §2。

## 命名空間

**tn**
fork 的命名空間前綴（取自 Tactical Navigator）。目錄 `src/tn/`、storage key `tn:<key>`、訊息 `tn:<name>`、型別模組 `'tn'`、側欄頁 `tn-<name>` 都用這個前綴。
_避免_：fork 前綴、自訂前綴

**tn 工具**
fork 自己開發的一個功能單元，程式碼放在 `src/tn/<tool>/`，UI 可以是 `tn-<name>` 側欄頁、`Tn<Name>` popup，或獨立 HTML 頁。
_避免_：小工具、插件、模組（「模組」保留給 TypeScript/ES module）

## 與 upstream 的接合

**掛鉤點**
upstream 檔案中，為了讓 tn 程式碼被呼叫而加入的一行（或一小段）程式。每個掛鉤點都帶有 `[TN]` 標記。
_避免_：hook（在程式碼與 commit scope 中可用 `hook`，文件中用「掛鉤點」）、patch

**掛鉤點白名單**
允許加入掛鉤點的 upstream 檔案與位置清單，維護在 `docs/fork/RULES.md` §3。不在清單上的 upstream 檔案一律不改。

**`[TN]` 標記**
掛鉤點上的註解：單行用 `// [TN]` 或 `<!-- [TN] -->`，多行用 `// [TN] begin` … `// [TN] end`。

**upstream 介面層**
`src/tn/core/upstream.ts`：tn 程式碼中唯一可以 import upstream 模組的檔案。upstream 改名或搬檔時，只需改這一個檔。

**tnUnpack**
tn 的 AJAX 分派器，位於 `src/tn/core/dispatch.ts`。它和 upstream 的 `unpack` 接收同一份 `express` 訊息 payload。

## 戰鬥腳本

**關卡**
一場特定的戰鬥，以遊戲的 quest ID 辨識；多段戰再以第幾場區分。同名 boss 的不同難度是不同關卡。
_避免_：副本、raid（raid 在程式碼中指單場戰鬥實例）

**戰鬥腳本**
針對一個關卡寫好的一組規則，以檔案形式匯入、匯出。
_避免_：攻略、劇本、script（在文件中）

**規則**
戰鬥腳本中的一條「條件 → 操作建議」。條件可組合回合數、boss HP 百分比區間、boss 獨有計量條（如破壞之力）區間、預兆、boss 身上的 buff，全部同時成立才算成立。

**預兆**
boss 預告將要發動、玩家可以在限定時間內達成條件來解除的特殊行動。規則以遊戲顯示的預兆文字比對。

**特殊行動**
boss 在特定 HP 或計量條門檻觸發的行動，口語稱「特動」；多數以預兆的形式出現。
_避免_：特動（在文件中）

**操作建議**
規則條件成立時，告訴使用者這時該使用哪些角色的哪些技能，可附說明文字。
_避免_：提示、指令

**啟用**
使用者勾選一份戰鬥腳本，表示它可以參與比對。進入戰鬥時，只有關卡與目前戰鬥相符的已啟用腳本會產生操作建議。

**參考資料**
使用者從網站存下的原始網頁（boss、攻略、角色、召喚）。

**知識庫**
參考資料轉譯成 AI 易讀格式後的文字檔，供協作產生戰鬥腳本使用。
_避免_：資料庫、knowledge base（在文件中）

## 分支

**同步分支**
`sync/upstream-YYYYMMDD`，用來把 `upstream/main` merge 進 `main`，驗證通過後以 PR 合回 `main`。

**回饋分支**
`upstream-pr/<slug>`，從 `upstream/main` 開出，用來向 upstream 提 bug fix PR，不得含 tn 程式碼。
