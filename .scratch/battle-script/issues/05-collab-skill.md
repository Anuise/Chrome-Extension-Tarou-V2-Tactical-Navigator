# 05: 協作 skill `tn-battle-script`

**What to build:** 腳本作者呼叫 repo 內的 Claude skill `tn-battle-script`，跟 AI 對話產生某關卡的戰鬥腳本。skill 先檢查參考資料是否有新增或更新並執行轉譯，再讀取關卡的 boss 知識庫與攻略，詢問出戰角色、召喚與打法，從角色／召喚知識庫確認技能名稱，產出腳本，通過驗證後寫入戰鬥腳本目錄。skill 也能讀取既有腳本依回饋修改，並在資料不足時告訴作者要補存哪一頁。依 `writing-for-agents` 撰寫。

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] skill 放在 repo 的 Claude skill 目錄，名稱 `tn-battle-script`，內容為繁體中文
- [ ] 提供驗證 CLI（`npx tsx` 執行），呼叫核心模組的 `validateScript`，輸出錯誤位置；skill 寫檔前必須通過
- [ ] skill 流程涵蓋：執行轉譯 → 讀 boss 知識庫與攻略 → 接受側欄頁複製的關卡資訊 → 詢問出戰名單與打法 → 查技能名 → 依神意分別產出 → 驗證 → 寫入 `battle-scripts/<questId>-<名稱>.json`
- [ ] skill 能讀既有腳本並依回饋修改
- [ ] 缺少所需知識庫時，skill 指出要存哪一類、哪一頁
- [ ] 以一段範例對話試跑，產出的檔案通過驗證 CLI
