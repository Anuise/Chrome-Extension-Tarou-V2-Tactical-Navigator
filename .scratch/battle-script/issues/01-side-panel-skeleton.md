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
