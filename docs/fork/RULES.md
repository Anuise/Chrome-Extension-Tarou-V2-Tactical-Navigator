# Fork 開發規則（Tarou V2 Tactical Navigator）

本 repo 是 [Waaatanuki/Chrome-Extension-Tarou](https://github.com/Waaatanuki/Chrome-Extension-Tarou) 的 fork。本檔優先於 `AGENTS.md` 中與本檔衝突的部分。目標：**tn 程式碼放在新檔案裡，upstream 檔案的差異只留在掛鉤點白名單內，讓 merge upstream 幾乎不衝突。**

名詞（upstream、fork 路徑、掛鉤點、tn 工具…）見 [`CONTEXT.md`](../../CONTEXT.md)。決策理由見 `docs/adr/` 的 ADR-0001 到 ADR-0006，本檔只寫做法。

## 0. 動手前

1. 列出這次要新增或修改的每個檔案。
2. 每個檔案都屬於 §2（fork 路徑）或 §3（掛鉤點白名單）：直接動手。
3. 任何一個不屬於：**先停下來問使用者**，流程見 §3 末段。
4. 開始新的 tn 工具前，先確認 `main` 已同步最新的 upstream 發版（§7）。

## 1. 分支

- `main`：fork 產品分支，包含 upstream 全部內容與 fork 程式碼。只用 merge 更新。
- 功能分支：從 `main` 開，以 PR 合回 `main`。
- `sync/upstream-YYYYMMDD`：同步 upstream 用（§7）。
- `upstream-pr/<slug>`：回饋 upstream 用，從 `upstream/main` 開（§9）。
- upstream 只用 remote ref `upstream/main` 追蹤。

理由：[ADR-0001](../adr/0001-main-as-fork-branch-merge-upstream.md)。

## 2. 新程式碼放哪（fork 路徑，可自由新增、修改）

| 用途 | 路徑 |
|---|---|
| 共用基礎 | `src/tn/core/`（`dispatch.ts` 的 `tnUnpack`、`storage.ts`、`upstream.ts`、`views.ts`） |
| 各工具 | `src/tn/<tool>/` |
| 側欄頁 | `src/views/sidePanel/views/tn-<name>/index.vue`（sidePanel 的 glob 只掃一層，必須放這裡） |
| popup 元件 | `src/views/popup/components/Tn<Name>.vue`（使用預設 800×800） |
| 獨立 HTML 頁 | `src/views/tn<Name>/{main.html,main.ts,main.vue}`（`getEntry()` 自動收錄） |
| 型別 | `types/modules/tn.d.ts`（`declare module 'tn'`） |
| 訊息協定 | `types/tn-shim.d.ts`：頂層要有 `import type ... from 'webext-bridge'`，才會與 `types/shim.d.ts` 合併 |
| 腳本 | `scripts/tn/` |
| 文件 | `CLAUDE.md`、`CONTEXT.md`、`docs/`、`.scratch/` |

命名一律用 `tn` 前綴（[ADR-0002](../adr/0002-tn-namespace.md)）：

- storage key：`tn:<key>`。在 tn 檔案內直接呼叫 `useWebExtensionStorage('tn:<key>', default)`。
- webext-bridge 訊息名：`tn:<name>`，宣告在 `types/tn-shim.d.ts`。
- 側欄頁 key `tn-<name>`；popup 元件 `Tn<Name>`；HTML entry 目錄 `tn<Name>`。

寫 tn 程式碼時：

- `src/tn/` 不在 auto-import 範圍內，一律顯式 import。tn 檔案放在 `src/tn/`，不放進 `src/composables/`。
- upstream 模組（`~/logic`、`~/composables/*`、`~/constants/*`、upstream 型別）只經由 `src/tn/core/upstream.ts` 取用（§6）。
- `pnpm bp` 不做型別檢查，漏掉的 import 只會在 runtime 報錯。每次改完都跑 `pnpm tc`。乾淨 clone 要先 build 一次產生 `types/auto-imports.d.ts`，`tc` 才不會誤報。
- UI 文字用繁體中文，直接寫死在元件裡。

## 3. 掛鉤點白名單（唯一可以修改的 upstream 檔案）

每處只加 import 與最少的呼叫行，並加 `[TN]` 標記（§4）。理由與查證：[ADR-0003](../adr/0003-hook-point-allowlist.md)。

| 檔案 | 允許的修改 |
|---|---|
| `src/background/index.ts` | 既有 `onMessage('express')` handler 內，`unpack(...)` 之後加 `tnUnpack(res.data as string)`；`setup*Listener()` 清單尾加 `setupTnBackground()`；對應的 import |
| `src/views/sidePanel/main.vue` | `downViewList` 開頭加 `...tnViewList,`；對應的 import |
| `src/contentScripts/index.ts` | 需要 DOM 擷取時加 `setupTnContentScript()`；對應的 import |
| `AGENTS.md` | 尾端一行指向本檔（[ADR-0004](../adr/0004-fork-rules-location.md)） |

- AJAX 資料一律從上表的 `tnUnpack` 取得。webext-bridge 6.0.1 每個訊息名只保留一個 handler，第二次呼叫 `onMessage('express', ...)` 會靜默取代 upstream 的 `unpack`。
- `tnUnpack` 內部自己 try/catch，讓 tn 的錯誤不會中斷 upstream 的 `unpack`。
- Chrome 原生事件（`chrome.webRequest.onCompleted`、`chrome.contextMenus.onClicked` 等）可以多處註冊，tn 的監聽一律寫在 `setupTnBackground()` 裡。

**要改白名單以外的 upstream 檔案時：**

1. 停下來問使用者，說明要改哪個檔案、哪一行、為什麼不能用 fork 路徑或既有掛鉤點達成。
2. 使用者同意後，把該位置加進上表。
3. 寫一份新的 ADR，記錄原因。
4. 修改處加 `[TN]` 標記。

如果要改的是 upstream 程式碼的 bug，改走 §9。

## 4. `[TN]` 標記

- 單行：行尾加 `// [TN]`；Vue template 用 `<!-- [TN] -->`。
- 多行：用 `// [TN] begin` … `// [TN] end` 包起來。
- 查全部掛鉤點：`grep -rn "\[TN\]" src types`；查實際差異：`git diff upstream/main...HEAD`。

## 5. 禁止事項

以下是硬性限制，遇到需要時一律先問使用者：

| 禁止 | 改用 | 依據 |
|---|---|---|
| 修改建置與設定：`vite.config*.mts`、`package.json` 的 `scripts`、`tsconfig.json`、`eslint.config.js`、`uno.config.ts`、`.github/`、`scripts/*.ts` | `scripts/tn/` 的獨立腳本 | ADR-0003 |
| 修改熱點：`src/composables/` 的 `useDataCenter.ts`、`useBattleLog.ts`、`useParty.ts`、`format.ts`、`useUtils.ts`；`src/logic/storage.ts`；`src/constants/*`；既有 `types/modules/*.d.ts`、`types/shim.d.ts`、`types/global.d.ts` | `tnUnpack`、`tn:` storage key、`types/modules/tn.d.ts`、`types/tn-shim.d.ts` | ADR-0002、0003 |
| 修改既有 `src/views/**`、`src/components/**` 檔案 | 新的 `tn-<name>` 側欄頁、`Tn<Name>` popup、`tn<Name>` HTML 頁 | ADR-0003 |
| 做 combatPanel 元件、做非預設尺寸的 popup | 側欄頁或預設尺寸 popup | ADR-0003 後果 |
| 修改 `manifest.json`、`changelog.json`（含新增權限或 host） | 沿用 upstream 版本 | [ADR-0005](../adr/0005-no-fork-release.md) |
| 另外呼叫 `onMessage('express', ...)` | §3 的 `tnUnpack` 掛鉤點 | ADR-0003 |
| import `~/api`（會把 `uid` 與引繼碼送到 upstream 作者的伺服器） | 純本機處理；需要後端時另開 ADR | ADR-0003 |
| 寫入任何 upstream 的 storage key | 只讀 upstream ref，自己的資料存 `tn:<key>` | ADR-0003 |
| rebase 或 force push `main` | merge | ADR-0001 |
| 推送 `x.y.z` 格式的 tag（會觸發 `release.yml`） | `tn-v*` | ADR-0005 |
| 在 `main` 上直接修 upstream 的 bug | §9 的 `upstream-pr/<slug>` | [ADR-0006](../adr/0006-upstream-contribution.md) |

## 6. 使用 upstream 程式碼

- `src/tn/core/upstream.ts` 是唯一 import upstream 模組的 tn 檔案，其他 tn 檔一律從它取用。upstream 改名或搬檔時只需改這一個檔。
- `upstream.ts` 不轉出 `~/api`。

## 7. 同步 upstream

時機：upstream 出現版號 bump commit（`chore: 更新版号x.y.z`）之後，以及開始新工具之前。side panel 的新版提示（`useVersionCheck`）就是訊號。

```bash
git fetch upstream
git switch -c sync/upstream-YYYYMMDD main
git merge upstream/main
```

衝突處理：

- 非白名單檔：`git checkout --theirs <file>`。
- 白名單檔：取 upstream 版本，再重新套上 `[TN]` 行。
- `pnpm-lock.yaml`：`git checkout --theirs pnpm-lock.yaml`，再 `pnpm install` 重新產生。

以下全部通過，才開 PR 合回 `main`：

```bash
pnpm install
pnpm bp
pnpm tc
pnpm lint
```

merge commit 訊息：`chore(sync): merge upstream <upstream 短 hash>`。

## 8. 依賴

- 優先用既有套件：`lodash-es`、`@vueuse/core`、`element-plus`、`cheerio`、`echarts`、`dayjs` 等。
- 新增套件前先問使用者。同意後用 `pnpm add -D`（upstream 全部套件都在 `devDependencies`），並登記在下表。

| 套件 | 用途 | 加入日期 |
|---|---|---|
| （尚無） | | |

## 9. 回饋 upstream

只回饋 upstream 程式碼的 bug fix；tn 工具留在 fork。從 `upstream/main` 開 `upstream-pr/<slug>`，分支內只有該修正，照 upstream 風格寫（簡中、`feat:`/`fix:`），PR 開到 upstream。fork 端用 cherry-pick 或等下次同步取得修正。見 [ADR-0006](../adr/0006-upstream-contribution.md)。

## 10. 版號與發版

fork 只自用，以解壓縮方式載入 `dist/`。版本號沿用 upstream，fork 需要 tag 時用 `tn-v*`。見 [ADR-0005](../adr/0005-no-fork-release.md)。

## 11. Commit

- Conventional Commits，訊息用繁體中文。
- tn 工具：`feat(tn-<tool>): ...`、`fix(tn-<tool>): ...`。
- 修改掛鉤點：scope 用 `hook`，例如 `feat(hook): 在 background 掛上 tnUnpack`。
- 同步：`chore(sync): merge upstream <短 hash>`。

## 12. Commit / PR 前檢查

```bash
git diff --name-only upstream/main...HEAD
```

完成條件：列出的每個檔案都屬於 §2 或 §3。不屬於的，撤回該修改，或先問使用者（§3 末段）。自動化腳本見 `.scratch/fork-guardrails/issues/01-check-upstream-diff.md`。

## 13. Agent skills 設定

- Issue tracker：本機 markdown，放在 `.scratch/<feature>/`。見 `docs/agents/issue-tracker.md`。
- Triage labels：預設五個（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。見 `docs/agents/triage-labels.md`。
- Domain docs：單一 context，根目錄的 `CONTEXT.md` + `docs/adr/`。見 `docs/agents/domain.md`。
