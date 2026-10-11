# 戰鬥腳本（tn-battle-script）

Status: ready-for-agent

名詞依 `CONTEXT.md`（關卡、戰鬥腳本、規則、操作建議、啟用、預兆、特殊行動、參考資料、知識庫）。相關決策：ADR-0003、ADR-0007、ADR-0008；fork 路徑與命名依 `docs/fork/RULES.md`。

## Problem Statement

高難度關卡（第一個目標是 2.0 戰鬥系統的「Lv350 顕現せし破壊の化身」）的打法取決於 boss 的回合、HP、破壞之力計量條、預兆與 boss 身上的 buff。使用者要在戰鬥中一邊看遊戲、一邊翻 wiki 特殊行動表與攻略，記住「現在這個狀態該按誰的哪個技能」，容易漏看或記錯。整理打法本身也很費工：資料散在灰機 wiki 與 NGA，每個關卡、每種神意都要各寫一套。

## Solution

三個部分：

1. **戰鬥腳本側欄頁**：extension 側欄新增一頁，上方沿用「战斗信息」的 boss 狀態卡，下方依目前戰鬥狀態，即時顯示已啟用戰鬥腳本中成立的規則與操作建議。使用者可以匯入多份戰鬥腳本、勾選啟用、匯出，並把目前關卡資訊複製出來交給協作 skill。
2. **參考資料轉譯工具**：把使用者存下的整頁 HTML（boss、攻略、角色、召喚）轉成附出處的 Markdown 知識庫，讓 AI 能可靠閱讀。
3. **協作 skill**：跟使用者對話，讀取知識庫與使用者的隊伍、打法，產出符合 schema 的戰鬥腳本檔。

## User Stories

### 側欄頁：檢視與即時建議

1. As a 玩家, I want 在側欄看到一個「戰鬥腳本」頁, so that 戰鬥中不用切到其他視窗查打法
2. As a 玩家, I want 頁面上方顯示與「战斗信息」相同的 boss 狀態卡（HP、回合、計時、預兆標籤）, so that 建議與 boss 狀態可以對照著看
3. As a 玩家, I want 進入戰鬥時頁面自動找出關卡與目前戰鬥相符的已啟用戰鬥腳本, so that 不用每場手動選
4. As a 玩家, I want 頁面只顯示目前條件全部成立的規則, so that 畫面上只有現在該做的事
5. As a 玩家, I want 多條規則同時成立時依腳本中的順序全部列出, so that 作者安排的優先順序被保留
6. As a 玩家, I want 每條成立的規則顯示它的說明文字（例如「第二階段：四王天出現」）, so that 我知道為什麼現在該這樣做
7. As a 玩家, I want 操作建議列出「角色 + 技能名」, so that 我能直接在遊戲裡找到要按的技能
8. As a 玩家, I want 操作建議也可以是純文字（例如「先存奧義」）, so that 非技能類的提醒也能寫進腳本
9. As a 玩家, I want 回合、HP、計量條、預兆、boss buff 改變時建議立即更新, so that 建議永遠對應當下狀態
10. As a 玩家, I want 同一關卡有多份已啟用腳本時可以在頁面上切換, so that 我能依本場拿到的神意（破壞／再生）選對版本
11. As a 玩家, I want 沒有相符腳本時頁面顯示「無符合腳本」並仍顯示 boss 狀態卡, so that 我知道功能有在運作只是沒有對應腳本
12. As a 玩家, I want 不在戰鬥中時頁面顯示腳本管理而非空白, so that 戰前也能整理腳本
13. As a 玩家, I want 頁面顯示目前戰鬥的 questId 與第幾場, so that 我能確認腳本對應的關卡是否正確

### 側欄頁：腳本管理

14. As a 玩家, I want 一次選取多個 JSON 檔匯入, so that 一個關卡的多個版本能一起匯入
15. As a 玩家, I want 匯入的腳本保存在 extension 中, so that 關閉瀏覽器後仍在
16. As a 玩家, I want 匯入同一個關卡、同名的腳本時覆蓋舊版, so that 用 skill 修改後重新匯入不會產生重複
17. As a 玩家, I want 格式錯誤的檔案整份拒絕並列出錯在哪條規則、哪個欄位, so that 我能回頭請 skill 修正
18. As a 玩家, I want 多檔匯入時一份失敗不影響其他份, so that 不必因為一份錯誤重來
19. As a 玩家, I want 每份腳本前有勾選框代表啟用, so that 只有我想用的腳本參與比對
20. As a 玩家, I want 腳本清單顯示名稱、關卡、規則數與出戰名單, so that 我能分辨相似的腳本
21. As a 玩家, I want 刪除不要的腳本, so that 清單保持乾淨
22. As a 玩家, I want 把任一份腳本匯出成 JSON 檔, so that 能交給 skill 修改或備份
23. As a 玩家, I want 按「複製目前關卡資訊」把 questId、第幾場、boss 名稱與 boss buff 的 status 清單複製到剪貼簿, so that skill 能拿到正確的關卡辨識與 buff ID

### 參考資料與知識庫

24. As a 腳本作者, I want 把 wiki 或 NGA 頁面存成 HTML 放進參考資料目錄的對應類別（boss、攻略、角色、召喚）, so that 工具知道它是什麼資料
25. As a 腳本作者, I want 執行一個指令就把所有參考資料轉成知識庫 Markdown, so that AI 讀的是乾淨文字而非整頁 HTML
26. As a 腳本作者, I want 轉譯結果保留 wiki 表格的結構, so that 特殊行動表的條件與效果不會錯位
27. As a 腳本作者, I want 原本靠圖示表達的資訊（status 圖示、光背、法灯）轉成含 status ID 與名稱的文字, so that AI 與規則能引用 buff ID
28. As a 腳本作者, I want 收合的分頁（例如破壞／再生神意）全部展開並加小標題, so that 不會漏掉隱藏內容
29. As a 腳本作者, I want 每份知識庫檔案開頭記錄來源 URL、站名或作者、擷取日期, so that 轉載有出處、也知道資料新舊
30. As a 腳本作者, I want 灰機 wiki 頁面能正確抓到內容區塊, so that 導覽列與頁尾不混進知識庫
31. As a 腳本作者, I want 未支援的網站也能以通用規則轉出主要內容, so that 新來源不會直接失敗
32. As a 腳本作者, I want 已轉譯且來源未變的檔案不重新轉, so that 重跑很快而且 diff 乾淨
33. As a 腳本作者, I want 同一份 HTML 每次轉出的結果完全相同, so that 知識庫的 diff 只反映來源變化
34. As a 腳本作者, I want 轉譯工具自動確保參考資料與 NGA 知識庫被 git 排除, so that 換電腦或重新 clone 也不會誤 commit 有版權疑慮的內容
35. As a 腳本作者, I want 灰機 wiki 來源的知識庫被 commit, so that 有版本紀錄、新 session 不必重轉

### 協作 skill

36. As a 腳本作者, I want 用一個 skill 跟 AI 一起寫某關卡的戰鬥腳本, so that 不必手寫 JSON
37. As a 腳本作者, I want skill 開始時先檢查參考資料有沒有新增或更新並自動轉譯, so that AI 讀到的知識庫是最新的
38. As a 腳本作者, I want skill 讀取該關卡的 boss 知識庫, so that 規則依據的是真實的 HP 門檻、預兆名稱與 buff
39. As a 腳本作者, I want skill 讀取我提供的攻略知識庫, so that 腳本延續既有的成熟打法
40. As a 腳本作者, I want skill 詢問我的出戰角色與召喚, so that 操作建議只用到我隊伍中的技能
41. As a 腳本作者, I want skill 從角色、召喚知識庫查技能名稱與效果, so that 建議的技能名稱正確
42. As a 腳本作者, I want 貼上側欄頁複製的關卡資訊作為起點, so that 腳本的 questId 與 buff ID 正確
43. As a 腳本作者, I want skill 依神意分別產出兩份腳本, so that 兩種神意的 80%、70% 預兆差異都被涵蓋
44. As a 腳本作者, I want skill 產出的檔案一定通過 extension 的匯入驗證, so that 不會產出無法匯入的腳本
45. As a 腳本作者, I want skill 把腳本存到 repo 的戰鬥腳本目錄並以關卡命名, so that 腳本有版本紀錄
46. As a 腳本作者, I want skill 能讀取既有的戰鬥腳本並依我的回饋修改, so that 實戰後可以迭代打法
47. As a 腳本作者, I want skill 在資料不足（例如缺角色知識庫）時告訴我需要存哪一頁, so that 我知道下一步要補什麼

## Implementation Decisions

### 模組

- **腳本核心模組**（tn 工具 `battle-script` 內，純 TypeScript，不依賴 Vue 或 chrome API）。對外只有兩個函式，是本功能主要的測試接縫：
  - `validateScript(input: unknown)`：回傳 `{ ok: true, script }` 或 `{ ok: false, errors }`；每個 error 指出規則索引與欄位路徑。以手寫型別守衛實作，不新增驗證套件。
  - `selectAdvice(scripts, snapshot, selectedScriptKey?)`：輸入已啟用的戰鬥腳本與 `BattleSnapshot`，回傳相符腳本清單、目前選中的腳本（未指定時取第一份），以及選中腳本中成立的規則（保持腳本順序）。
- **BattleSnapshot**：核心模組自己定義的輸入型別，與 upstream 型別解耦。欄位：`questId`、`battleCount`、`turn`、`hpPercent`、`gauge`（boss 獨有計量條）、`omenText`（預兆文字）、`bossBuffStatuses`（boss buff 的 status 字串陣列）。
- **側欄頁 `tn-battle-script`**：經由 tn 側欄註冊掛鉤點加入 `downViewList`。負責：把 upstream 的 `battleInfo` 轉成 `BattleSnapshot`；呼叫核心模組；畫出建議區與腳本管理區。boss 狀態卡經由 upstream 介面層 import upstream 的 `BossCard` 元件（ADR-0008），不複製、不修改。
- **儲存**：戰鬥腳本與啟用狀態存在 `tn:battle-scripts`。只讀 upstream 的 `battleInfo`，不寫入任何 upstream storage key。
- **資料來源全部沿用 upstream 已存的欄位**：回合（`bossInfo.turn`）、HP%（`bossInfo.hpPercent`）、計量條（`bossInfo.addition.genesis`）、預兆文字（`bossInfo.interrupt_display_text`，以 `|` 連接）、boss buff（`buffInfo.bossBuffs[].status`）、questId（`bossInfo.questId`）。本 spec 不需要 `tnUnpack` 解析，也不需要 content script。
- **battleCount**：upstream 目前沒有存 `battle.count`。實作時先確認 `battleInfo` 中是否可取得；取不到時視為 1，並在腳本省略 `battleCount` 時不比對該欄位。
- **轉譯工具**（fork 腳本目錄，`npx tsx` 執行，cheerio 解析）：
  - 純函式 `convertHtml(html, site, meta)` 回傳 Markdown，是第二個測試接縫；CLI 外殼負責掃描參考資料目錄、比對 mtime 與 frontmatter 的擷取時間、寫檔、維護 `.git/info/exclude`。
  - 網站設定：每個網站一組「內容區塊 selector」與清理規則。先支援灰機 wiki（內容區塊 `#mw-content-text`），其他網站 fallback 到 `<main>` / `<article>` / `<body>`。NGA 等使用者提供範例 HTML 後再加。
  - 表格轉 Markdown 表格；收合分頁全部展開並加小標題；`<img>` 依 alt、title、檔名轉成 `[status:<id> <名稱>]` 之類的識別文字；不輸出圖檔。
  - frontmatter：`source`（URL）、`site`、`author`（有則填）、`fetchedAt`（擷取日期）、`category`。
  - 目錄對應：參考資料 `reference/<category>/<名稱>/` → 知識庫 `knowledge/<category>/<名稱>.md`；category 為 `boss`、`guide`、`character`、`summon`。現有的 `reference/boss_info/` 改名為 `reference/boss/`。NGA 來源輸出到 `knowledge/guide/nga/`。
  - 每次執行確保 `.git/info/exclude` 含 `reference/` 與 `knowledge/guide/nga/`（ADR-0007）。
- **協作 skill**：放在 repo 的 Claude skill 目錄，名稱 `tn-battle-script`，依 `writing-for-agents` 撰寫。流程：檢查並執行轉譯 → 讀取關卡 boss 知識庫與相關攻略 → 詢問出戰名單與打法 → 讀角色、召喚知識庫確認技能名 → 產出腳本 → 以核心模組的 `validateScript` 驗證 → 寫入 `battle-scripts/<questId>-<名稱>.json`。

### 戰鬥腳本 schema（version 1）

型別放在 tn 型別模組。

```json
{
  "version": 1,
  "name": "顕現 破壞神意版",
  "questId": "305421",
  "battleCount": 1,
  "party": { "characters": ["主角(xxx)", "..."], "summons": ["..."] },
  "rules": [
    {
      "note": "第二階段：四王天出現",
      "when": {
        "turn": [1, 3],
        "hp": [50, 15],
        "gauge": [50, 100],
        "omen": "浄土",
        "bossBuff": "4052_1"
      },
      "advice": [
        { "character": "主角", "skill": "ディスペル" },
        { "text": "先存奧義" }
      ]
    }
  ]
}
```

規則比對語意：

- `when` 的每個欄位都可省略；寫了的全部成立才算成立（AND）。`when` 為空時規則永遠成立。
- 區間兩端都包含，端點順序不限（`[50, 15]` 與 `[15, 50]` 相同）。`turn` 也可以寫單一數字。
- `omen`：子字串比對預兆文字。
- `bossBuff`：任一個 boss buff 的 status 以該字串為前綴即成立。
- 腳本與戰鬥相符的條件：`questId` 相同，且（腳本未寫 `battleCount` 或 `battleCount` 相同）。
- 腳本的唯一鍵為 `questId` + `name`，重複匯入時覆蓋。
- 規則不記錄任何觸發狀態；每次狀態變化時重新計算。
- `questId` 以字串比對。

## Testing Decisions

- 好的測試只驗證外部行為：給定輸入，檢查回傳值。不檢查內部輔助函式、不 mock 模組內部。
- 測試工具：Node 內建 `node:test` + `node:assert`，以 `npx tsx --test` 執行。不新增套件，不修改 `package.json` 的 scripts。
- **腳本核心模組**（接縫 1）：
  - `validateScript`：合法腳本通過；缺少必要欄位、型別錯誤、`version` 不支援、區間格式錯誤時回傳 errors，且 errors 指出正確的規則索引與欄位路徑。
  - `selectAdvice`：questId／battleCount 比對；每種條件單獨成立與不成立；區間端點包含與反向端點；AND 組合；多條規則依腳本順序；同關卡多份腳本與指定選中腳本；無相符腳本；snapshot 欄位缺失（例如不在戰鬥中）時不拋錯。
- **轉譯工具**（接縫 2）：以手寫的小型 HTML fixture 測 `convertHtml`，涵蓋灰機內容區塊擷取、表格、收合分頁展開、status 圖示轉文字、frontmatter、fallback 網站、相同輸入輸出完全相同。原始 wiki 頁不 commit，不可作為 fixture。
- **只做手動驗證**：側欄頁 UI（實際打一場「顕現」確認建議隨狀態更新、匯入／匯出／啟用／切換／複製關卡資訊）；skill（產出第一份腳本並成功匯入 extension）。
- 先例：repo 目前沒有任何自動測試，這是第一批；每次改動仍需跑 `pnpm tc` 與 `pnpm lint`。

## Out of Scope

- 在遊戲畫面上框出建議的技能（DOM 注入）。
- 技能冷卻、可用狀態與チャージターン、OD、Break 的解析。
- 規則只觸發一次、規則的觸發狀態紀錄。
- 預告「下一條即將成立的規則」。
- 「神意」作為規則條件（改以每種神意各一份腳本處理）。
- 「階段」作為規則條件（以計量條與 HP 區間表達）。
- 在側欄頁內編輯腳本。
- 由 extension 匯出隊伍或戰鬥紀錄給 skill 反推腳本。
- NGA 的內容區塊 selector（等使用者提供範例 HTML）。
- 2.0 以外戰鬥系統的專門支援；第一個驗證案例只有「Lv350 顕現せし破壊の化身」。

## Further Notes

- 使用者已確認 upstream 的「战斗信息」頁在「顕現」戰中能正確更新回合、HP 與預兆，所以資料管道可直接沿用。
- 建議實作順序：schema 與核心模組 → 側欄頁與轉譯工具（可平行）→ skill（依賴前兩者，並以實戰驗證側欄頁）。
- 第一份戰鬥腳本由 skill 協作產出（破壞神意版與再生神意版各一），同時作為 skill 與 schema 的驗收。
- 本功能需要的 fork 路徑（Claude skill、戰鬥腳本、知識庫、參考資料）已在 RULES §2 登記。掛鉤點只需要白名單中的側欄註冊一處；本 spec 不需要 `tnUnpack` 與 content script 掛鉤點。`src/tn/core/` 尚不存在，第一個 issue 需一併建立側欄註冊所需的最小 core（`views.ts`、`upstream.ts`）與 `src/views/sidePanel/main.vue` 掛鉤點。
