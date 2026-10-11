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

## Comments

### 實作摘要（分支 `tn-battle-script/05-collab-skill`）

- 驗證 CLI：`npx tsx scripts/tn/validate-battle-script.ts <檔案...>`，原始碼 `scripts/tn/validate-battle-script.ts`，以相對路徑 import 核心模組的 `validateScript`。
  - 每個檔案各自檢查，做法與側欄頁匯入相同：`JSON.parse` 後交給 `validateScript`。
  - 通過時 stdout 印 `<檔案>：通過`。
  - 失敗時 stderr 每個錯誤一行 `<檔案>：<欄位路徑>：<說明>`，欄位路徑為空時省略。讀不到檔案印 `<檔案>：無法讀取檔案：…`；不是 JSON 印 `<檔案>：不是有效的 JSON：…`，字樣與側欄頁相同。
  - exit code：全部通過為 0；任一檔案失敗、讀不到，或沒有指定檔案時為 1。
  - 測試：`scripts/tn/validate-battle-script.test.ts` 共 7 個，以 `node --import tsx` 實際執行 CLI，檢查 stdout、stderr 與 exit code。
- skill：`.claude/skills/tn-battle-script/SKILL.md`，單一檔案、繁體中文，依 `writing-for-agents` 撰寫。
  - 由模型自動觸發：description 涵蓋寫新腳本、依回饋修改、貼上關卡資訊 JSON 三種情況，作者不輸入 skill 名稱也能觸發。
  - 寫新腳本共 10 步，每步都有完成條件：轉譯 → 確定關卡（關卡資訊 JSON、boss 狀態卡、boss 知識庫）→ 讀知識庫並寫出階段大綱 → 問出戰名單 → 查技能 → 提出打法 → 依神意分別產出草稿 → 驗證 → 寫入 → 回報。
  - 「修改既有腳本」：讀腳本並先驗證，同時問作者實戰確認了哪些項目 → 讀知識庫 → 改成草稿（questId 與 name 不變）並用 diff 比對 → 接驗證、寫入、回報。
  - 參考段落：「寫規則」說明條件值的來源、寫法、名稱與檔名；「知識庫與缺資料時」說明位置、標記，以及要存哪一類、哪一頁與存法。
  - 全程維護「待確認清單」：條件值與規則依賴的行為，只要還沒被關卡資訊 JSON 或作者確認，就列入清單，回報時交給作者在實戰中確認。

### 設計決定

1. 驗證 CLI 只驗證、不寫檔。skill 先把草稿寫在 repo 外的暫存目錄，通過後才寫進 `battle-scripts/`，寫入後再驗證一次，所以目錄裡不會留下沒通過的檔案。
2. 檔名 `battle-scripts/<questId>-<名稱>.json` 中的名稱用腳本的 `name`。這樣檔名與 extension 的唯一鍵 questId + name 一一對應：修改後重新匯入會覆蓋舊版，檔案也在原處更新。
3. 寫入後執行 `npx eslint --fix`，因為 `battle-scripts/*.json` 會被 `pnpm lint` 檢查。實測 agent 手寫 JSON 常見的大括號內空白、尾逗號、缺結尾換行都能自動修正。
4. 以下資料在 repo 裡沒有實際樣本，skill 規定在作者確認前一律列入待確認清單：
   - 預兆標籤文字：upstream 的 `interrupt_display_text` 是字串陣列，以 `|` 串接後由 BossCard 逐一畫成標籤，但不確定是否包含預兆名。確認前，同一區間依序出現的預兆合併成一條規則。
   - 計量條刻度：`addition.genesis` 是遊戲原始值，知識庫寫的是 0–100%。
   - boss buff 的 status 字串：upstream 用 `status_<status>.png` 組圖示網址（去掉 `-`），通常與灰機 wiki 的 `Status_<ID>.png` 相同但不保證，以關卡資訊 JSON 的 `bossBuffStatuses` 為準。
5. `battleCount` 一律省略：側欄頁固定當成 1（ticket 01），寫 2 以上的腳本永遠不會相符。
6. 召喚石的操作建議寫成 `{ "text": "召喚：<召喚石>" }`，因為 `{ character, skill }` 是角色技能。
7. 同一關卡的多份腳本（破壞版、再生版），共用的階段每份都寫。側欄頁一次只顯示選中的一份（`selectAdvice` 只回傳選中腳本的規則，切換由 04 負責），所以不會重複顯示。

### 與 ticket 的差異

- 步驟順序：ticket 寫「詢問出戰名單與打法 → 查技能名」。試跑時 agent 指出，提出打法草案需要先知道技能，因此改成「問出戰名單 → 查技能 → 提出打法」。
- 關卡資訊 JSON 在步驟 2 與 boss 知識庫一起取得，因為要用 questId 找知識庫。
- 「依神意分別產出」寫成通則：boss 知識庫中依神意（或其他玩家分組）而不同的內容，每種各產出一份。

### 試跑

- 方式：開一個新的 subagent，只讀 `SKILL.md`（不讀 `.scratch/`、`docs/`），照步驟執行；我扮演作者，透過訊息回覆。boss 知識庫用真實的 `knowledge/boss/Lv350 顕現せし破壊の化身.md`。
- 作者的回答是模擬的，不是實際遊戲資料：
  - 關卡資訊 JSON：questId `305701` 取自知識庫的自發連結；`bossBuffStatuses` 依知識庫的開場 buff 編成（`4051`、`4052_1`～`4052_6`、`3349_10`）。
  - 出戰名單與技能由作者口述：主角（ヤマト）、ソーン、カタリナ、サンダルフォン，召喚石ルシフェル、バハムート。技能名與作用只作示範，沒有查證。
  - 計量條刻度與預兆標籤文字都回答「不確定」，讓流程走待確認清單的路徑。
- 過程（4 輪對話）：
  1. 轉譯（轉譯 0 個、跳過 0 個）→ 以 questId 找到 boss 知識庫 → 寫出完整的階段大綱 → 發現攻略、角色、召喚知識庫都沒有，把關卡資訊、攻略來源與出戰名單合併成一輪提問。
  2. 列出可補存的角色與召喚頁面（作者已口述技能，註明不必存）→ 逐段提出打法草案，標明名單解不掉的預兆並改提減傷，關鍵的 50% 浄土另外問作者。
  3. 產出破壞版、再生版草稿 → 驗證 CLI 兩份都通過 → 寫入 `battle-scripts/` → `eslint --fix`（沒有改動）→ 再驗證通過 → 回報完整路徑、規則數、待確認清單與匯入方式。
  4. 修改既有腳本：先驗證既有檔案 → 依回饋改兩份共用的開場規則，再改再生版 70% 規則的技能順序 → diff 確認只改了要求的部分 → 驗證、寫回、eslint、再驗證。我另外比對第 3 輪的檔案，差異只有回饋要求的 3 處，questId、name 與檔名都沒變。
- 產物：`305701-顕現 破壞神意版.json`（12 條規則）與 `305701-顕現 再生神意版.json`（13 條規則）。驗證 CLI 與 `CI=1` 的 eslint 都通過。依指示沒有 commit，已移出 repo。
- skill 回饋：試跑中 agent 共提出 26 項，採納 22 項並改進 `SKILL.md`，主要有：
  - 步驟 1 的完成條件對不上實際輸出；指令輸出的雜訊（`npm warn`、`DEP0205`、eslint 的 editor 模式提示）統一在開頭說明。
  - git worktree 看不到只留在本機的 `reference/` 與 NGA 知識庫。
  - 問題要合併成一輪；步驟改為名單 → 技能 → 打法；名單做不到的解除條件要標明並提出替代做法。
  - 何時請作者看狀態卡上的計量條數字與預兆標籤；「看過數字」不等於確認了刻度；`omen` 的 `|` 不是「或」。
  - 規則寫法：沒有 OR 與 NOT；階段由 HP 或計量條先到門檻而結束時，兩種條件都要寫；計量條到頂後區間會重疊；前綴比對會誤中更長的 status（`3349_1` 命中 `3349_10`）；未確認的值寧可不拿來縮小範圍。
  - 待確認清單也收行為假設；說明技能目的的寫法；回報附完整路徑；修改時問作者確認了哪些項目，並用 diff 比對。
  - 「多版本腳本會重複顯示」是錯誤前提，改為在 skill 寫明側欄頁一次只顯示一份。
  - 沒採納的 4 項：3 項是 agent 本來就會做的事，1 項是試跑環境的 worktree 隔離限制。

### 未完成與請使用者確認

- skill 的實際協作，以及腳本匯入 extension 後能否隨戰鬥正確更新，屬於 06，本 ticket 沒有做。
- 預兆標籤文字、計量條刻度、boss buff 的實際 status 字串都要靠實戰資料確認。確認後，可以把 `SKILL.md`「條件值的來源」的說明改成定論。
- `scripts/tn/convert-reference.ts`（02）在完全沒有參考資料時也印「（來源未變）」，容易誤導，本 ticket 沒有修改。
- 本機用 Git Bash 執行 `./node_modules/.bin/eslint .` 全量檢查時會 segfault（exit 139）；改在 PowerShell 執行 `pnpm lint` 則正常。PowerShell 也偶爾在寫完結果後以 0xC0000005 結束，重跑即正常。
- 合併 04 後，skill 裡的側欄頁操作已改成 04 的版面：「目前戰鬥」分頁的「複製目前關卡資訊」與「腳本：」選單，「腳本管理」分頁的「匯入戰鬥腳本」（可多選）。
- 04 的 `manage.ts` 有一個不匯出的 `readScript`，做的事與驗證 CLI 相同（`JSON.parse` + `validateScript` + 錯誤字串），目前兩邊輸出的字樣一致。本 ticket 依指示直接呼叫 `validateScript`，沒有改用它；之後若要讓 CLI 與匯入共用同一段程式，可以匯出 `readScript` 給 CLI 使用。

### 驗證紀錄（合併 04 後）

- 測試：`npx tsx --test "src/tn/**/*.test.ts" "scripts/tn/**/*.test.ts"` 共 75 個，全部通過（本 ticket 新增 7 個）。
- `pnpm tc`、`pnpm bp` 通過。
- `CI=1 pnpm lint` 共 291 problems，與基準相同；新增與修改的檔案都是 0 error、0 warning（`.claude/**` 不在 lint 範圍內）。
- `git diff --name-only upstream/main...HEAD` 只含 fork 路徑與白名單檔。
