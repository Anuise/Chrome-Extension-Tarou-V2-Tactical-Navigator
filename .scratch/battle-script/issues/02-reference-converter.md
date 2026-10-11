# 02: 參考資料轉譯工具（灰機 wiki）

**What to build:** 腳本作者執行一個指令（`npx tsx` 執行 fork 腳本目錄下的轉譯腳本），就把參考資料（boss、攻略、角色、召喚四類）轉成附出處的知識庫 Markdown。轉譯是確定性的：同一份 HTML 每次輸出完全相同。來源未變的檔案跳過。每次執行都確保參考資料與 NGA 知識庫被 git 排除。見 spec「轉譯工具」與 ADR-0007。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 純函式 `convertHtml(html, site, meta)` 回傳 Markdown，CLI 外殼負責掃描、比對、寫檔
- [ ] 灰機 wiki：只擷取內容區塊；表格轉 Markdown 表格；收合分頁全部展開並加小標題；`<img>` 依 alt／title／檔名轉成含 status ID 與名稱的識別文字；不輸出圖檔
- [ ] 未支援的網站 fallback 到 main／article／body
- [ ] frontmatter 含來源 URL、站名、作者（有則填）、擷取日期、類別
- [ ] 目錄對應 `reference/<category>/<名稱>/` → `knowledge/<category>/<名稱>.md`；現有 `reference/boss_info/` 改名為 `reference/boss/`
- [ ] 來源 mtime 未晚於知識庫 frontmatter 擷取時間時跳過
- [ ] 每次執行確保 `.git/info/exclude` 含 `reference/` 與 `knowledge/guide/nga/`，不修改 `.gitignore`
- [ ] `node:test` 測試（`npx tsx --test`）以手寫小型 HTML fixture 涵蓋上述轉換行為與輸出穩定性；不使用原始 wiki 頁當 fixture
- [ ] 轉出「Lv350 顕現せし破壊の化身」的知識庫檔案並 commit，人工檢查特殊行動表、神意分頁、四王天 buff 未遺漏
- [ ] 未新增套件；未修改 `package.json` scripts
