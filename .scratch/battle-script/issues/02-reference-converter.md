# 02: 參考資料轉譯工具（灰機 wiki）

**What to build:** 腳本作者執行一個指令（`npx tsx` 執行 fork 腳本目錄下的轉譯腳本），就把參考資料（boss、攻略、角色、召喚四類）轉成附出處的知識庫 Markdown。轉譯是確定性的：同一份 HTML 每次輸出完全相同。來源未變的檔案跳過。每次執行都確保參考資料與 NGA 知識庫被 git 排除。見 spec「轉譯工具」與 ADR-0007。

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] 純函式 `convertHtml(html, site, meta)` 回傳 Markdown，CLI 外殼負責掃描、比對、寫檔
- [x] 灰機 wiki：只擷取內容區塊；表格轉 Markdown 表格；收合分頁全部展開並加小標題；`<img>` 依 alt／title／檔名轉成含 status ID 與名稱的識別文字；不輸出圖檔
- [x] 未支援的網站 fallback 到 main／article／body
- [x] frontmatter 含來源 URL、站名、作者（有則填）、擷取日期、類別
- [x] 目錄對應 `reference/<category>/<名稱>/` → `knowledge/<category>/<名稱>.md`；現有 `reference/boss_info/` 改名為 `reference/boss/`
- [x] 來源 mtime 未晚於知識庫 frontmatter 擷取時間時跳過
- [x] 每次執行確保 `.git/info/exclude` 含 `reference/` 與 `knowledge/guide/nga/`，不修改 `.gitignore`
- [x] `node:test` 測試（`npx tsx --test`）以手寫小型 HTML fixture 涵蓋上述轉換行為與輸出穩定性；不使用原始 wiki 頁當 fixture
- [ ] 轉出「Lv350 顕現せし破壊の化身」的知識庫檔案並 commit，人工檢查特殊行動表、神意分頁、四王天 buff 未遺漏
- [x] 未新增套件；未修改 `package.json` scripts

## Comments

### 實作摘要（分支 `tn-battle-script/02-reference-converter`）

- 轉譯指令：`npx tsx scripts/tn/convert-reference.ts`（路徑以腳本位置推算，在任何目錄執行皆可）。
- 純函式在 `scripts/tn/convert-html.ts`：`convertHtml(html, site, meta)` 與 `detectSite(html)`；CLI 外殼在 `scripts/tn/convert-reference.ts`。
- 測試：`npx tsx --test "scripts/tn/**/*.test.ts"`，27 個，全部是手寫小型 fixture。
- CLI 寫檔前以 repo 的 ESLint 設定（Node API，等同 `eslint --fix`）格式化，讓 Prettier 對齊表格；不直接 import prettier。
- 驗證過：第二次執行跳過；`touch` 來源後重轉；還原 mtime、刪除知識庫後重轉，md5 與第一次相同；exclude 不重複加入；一般 clone 的 `git rev-parse --git-path info/exclude` 回傳相對路徑也能處理。
- 另以暫時檔驗證：NGA 來源輸出到 `knowledge/guide/nga/` 且被 git 忽略；一般網站走 fallback；未知類別目錄與直接放在類別目錄的 HTML 會印出警告。

### 人工檢查清單自我檢查（`huiji-html.md` §10.2，以腳本逐項比對知識庫檔案）

- A1 frontmatter：`source` 為 canonical、`site` 為「灰机wiki（碧蓝幻想中文维基）」、`fetchedAt` 為來源 mtime `2026-10-11T04:56:34Z`、`category` 為 `boss`，沒有 `author`。通過。
- A2 不應出現的文字（站方提示框、RichTab 註解、NewPP、Cached time、于1个月前、刷新、站點介紹、京ICP备、分頁 id、`[status:1]`、`[status:2]`、`Passive_effect`、`Enemy_`、`2900032000`）：皆未出現。
- A3 應出現的文字（Lv350 顕現せし破壊の化身、16,500,000,000 （165亿）、重力、减速、305701、※特动效果探寻中、独有系统、基本信息、阶段）：皆出現。
- B 分頁：外層 4 個分頁標題齊全；內層兩組「破坏之神意／再生之神意」都在第一阶段Ⅱ；原本隱藏的 pane 都有內容。
- C1 欄名：满豆技 3 次、特殊行动 4 次（第三阶段只有特殊行动）。
- C2 4 條階段說明完整，第一阶段Ⅰ與Ⅱ相同。
- C3 預兆框 24 個（各階段 7／10／6／1），轉成引言區塊。
- C4 粗體「解除条件」21 次（輸出為 `**解除条件**：`，見下方差異 4）。
- C5 預兆類型標記 `[架势技]` 36 個、`[咏唱技]` 10 個。
- C6 門檻文字皆在，70% 連續預兆兩種神意共 6 處。
- C7 他化自在格式 `/[status:3348]` 22 次，例如「赋予12/[status:3348]15个弱体效果」。
- C8 第三阶段神撃保留粗體數字 120、5、1、6、15。
- D1 `[status:` 共 188 個，其中輪播組 36 個且列出整組 ID。
- D2 四王天、忉利天、夜摩天、兜率天、化楽天各自的表頭、效果與解除條件都在；D3「四王天类BUFF」10 處。
- D4 關鍵 ID（4051、4052 組、4054、4055 組、4055_7、3349_1、3349_10、3350、3351、3352、1019_0_1000、6360_5、3348）皆出現；D5 boss 與道具名稱沒有重複。
- E 確定性：同一份 HTML 重轉逐位元組相同；分頁 active、輪播 active、分頁 id、NewPP 註解不同時輸出相同（測試涵蓋）。

### 與 spec 的差異與實作決定

1. `fetchedAt` 寫 UTC 時間到秒（例如 `2026-10-11T04:56:34Z`），不是只有日期：跳過判斷要比對 mtime，只有日期無法分辨同一天重存的頁面。
2. H1 用 wiki 的頁面標題（灰機取 `#firstHeading`，本頁為「显现·破坏之化身」）；檔名用參考資料目錄名。
3. NGA 來源不論放在哪個類別目錄，一律輸出到 `knowledge/guide/nga/`，避免誤 commit；NGA 的內容區塊 selector 仍未做（spec Out of Scope），先走 fallback。
4. 粗體若會違反 CommonMark 界定規則，把邊緣的標點移到 `**` 外（`**解除条件**：`、`**80**%`），否則 GitHub 與 VS Code 預覽會直接顯示星號。
5. 標籤（預兆名等）後面直接接文字時補一個空白（`[架势技]浄土 解除/触发前`、`[咏唱技]神撃 第三阶段连续预兆`），避免 AI 把後面的字當成預兆名。
6. 表格規則：整列 th 轉小標題（有換行時改粗體段落）；整列 td 拆到表格外；單欄表格（預兆框）轉引言區塊；`border:0` 排版表格壓平；格子含巢狀表格或分頁、或沒有表頭又有跨欄格子時改段落模式；rowspan 延伸格填「（同上）」。
7. 非 status 圖片：alt 是檔名的視為裝飾不輸出；有文字說明的輸出 `[img:說明]`。預兆類型圖示 `Status 1／2` 輸出 `[架势技]／[咏唱技]`。
8. 表格外的 `<br>` 輸出為一般換行（GitHub 預覽會併成一行，AI 讀原始檔不受影響）。

### 請使用者確認的重點

- 特殊行動表 24 個預兆框的條件與效果是否對位正確，尤其第一阶段Ⅱ的兩組神意分頁。
- 第二阶段「光背／被动技能／四王天」表被切成三段（中間的被动技能改段落模式）是否好讀。
- 差異 4、5 的寫法（標點移到粗體外、標籤後補空白）是否可接受。
- `pnpm lint` 會掃到未追蹤的 `reference/**`（ESLint 不讀 `.git/info/exclude`），1MB 的 HTML 會讓 lint 很慢並報錯；改 `.gitignore` 或 `eslint.config.js` 都在白名單外，需要使用者決定。目前驗收時加 `--ignore-pattern "reference/**"`。

### 收尾

- 已合入 integration 分支 `feat/tn-battle-script`（merge commit `a8a904a`）；code review 修正於 `a14197e` 合入。修正後轉譯工具改為每個網站一份設定（`SITES`），重新轉譯結果與已 commit 的知識庫逐位元組相同。
- `reference/boss_info/` 已在存有原始 HTML 的 worktree（`.claude/worktrees/grill-with-docs-features-498d59`）改名為 `reference/boss/`。主 checkout 的 `reference/boss_info/` 是空目錄，尚未處理。
- 尚待使用者：人工檢查知識庫（未勾選項，重點見上方「請使用者確認的重點」）。檢查完成後把 Status 改為 `resolved`。
