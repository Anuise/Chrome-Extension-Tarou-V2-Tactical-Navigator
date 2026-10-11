# 0007. 參考資料只留本機，知識庫附出處 commit，NGA 攻略不 commit

- 狀態：已採納
- 日期：2026-10-11

## 背景

戰鬥腳本由 skill 協作產生，skill 需要 boss 機制、攻略、角色、召喚的資料。使用者從灰機 wiki 與 NGA 存下整頁 HTML（含圖片）。本 repo 是 public，commit 這些內容等於公開轉載：灰機 wiki 是愛好者整理的事實性資料，站方聲明圖片版權屬 Cygames；NGA 攻略是個人創作。

## 決策

1. 原始 HTML 放 `reference/<類別>/<名稱>/`，以 `.git/info/exclude` 排除，不 commit。不用 `.gitignore`，因為它是白名單外的 upstream 檔案。
2. `scripts/tn/` 的轉譯腳本以 cheerio 把 HTML 轉成 Markdown，放 `knowledge/<類別>/<名稱>.md`。只轉文字，圖示改寫成識別文字（如 `[status:4052_3 光背]`），不帶圖檔。
3. 每份知識庫檔案的 frontmatter 註明來源 URL、站名或作者、擷取日期。
4. 灰機 wiki 來源的知識庫 commit；NGA 攻略轉成 `knowledge/guide/nga/`，同樣以 `.git/info/exclude` 排除。

## 考慮過的選項

- 全部 commit：最方便，但公開轉載個人攻略。
- 全部不 commit：沒有版權疑慮，但換電腦或新 session 就要重新轉譯，也失去版本紀錄。
- 讓 AI 直接讀 HTML、不做轉譯：省掉腳本，但結果不可重現、會漏內容，且 HTML 不能 commit。

## 後果

- 若 repo 改為 private，可以重新考慮 commit NGA 攻略。
- 轉譯是確定性的，網站改版時只需改轉譯腳本的 selector 設定。
- `.git/info/exclude` 不受版本控制，新 clone 會遺失排除設定。轉譯腳本每次執行時檢查並補上 `reference/` 與 `knowledge/guide/nga/` 兩項。
