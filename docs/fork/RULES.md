# Fork 開發規則（Tarou V2 Tactical Navigator）

本 repo 是 [Waaatanuki/Chrome-Extension-Tarou](https://github.com/Waaatanuki/Chrome-Extension-Tarou) 的 fork。本檔是給 AI 與人類的 fork 專屬規則，優先於 `AGENTS.md` 中與本檔衝突的部分。目標只有一個：**開發自有工具時盡量不修改 upstream 檔案，降低 merge upstream 的衝突。**

名詞定義見 `CONTEXT.md`；決策理由見 `docs/adr/0001`–`0006`；統計證據見 `docs/research/architecture.md`。

## 0. 動手前

1. 讀 `CONTEXT.md` 與相關 ADR。
2. 確認改動只落在「fork 擁有的路徑」（§2）或「掛鉤點白名單」（§3）。不是的話，**停下來問使用者**。
3. 開始新工具前，先確認 `main` 已同步最新 upstream 發版（§7）。

## 1. 分支

- `main`：fork 產品分支，包含 upstream 全部內容與 fork 程式碼。禁止 rebase、禁止 force push。
- 功能分支：從 `main` 開，以 PR 合回 `main`。
- `sync/upstream-YYYYMMDD`：同步 upstream 專用（§7）。
- `upstream-pr/<slug>`：回饋 upstream 用，**從 `upstream/main` 開**，不得含任何 tn 程式碼（§9）。
- upstream 只透過 remote ref `upstream/main` 追蹤，不另建鏡像分支。

## 2. fork 擁有的路徑（可自由新增、修改）

| 用途 | 路徑 |
|---|---|
| 共用基礎 | `src/tn/core/`（`dispatch.ts` 的 `tnUnpack`、`storage.ts`、`upstream.ts`、`views.ts`） |
| 各工具 | `src/tn/<tool>/` |
| 側欄頁 | `src/views/sidePanel/views/tn-<name>/index.vue`（sidePanel 的 glob 只掃一層，所以必須放這裡） |
| popup 元件 | `src/views/popup/components/Tn<Name>.vue` |
| 獨立 HTML 頁 | `src/views/tn<Name>/{main.html,main.ts,main.vue}`（`getEntry()` 自動收錄，不需改 vite） |
| 型別 | `types/modules/tn.d.ts`（`declare module 'tn'`） |
| 訊息協定 | `types/tn-shim.d.ts`：頂層必須有 `import type ... from 'webext-bridge'`，才會成為 augmentation，與 `types/shim.d.ts` 合併 |
| 腳本 | `scripts/tn/` |
| 文件 | `CLAUDE.md`、`CONTEXT.md`、`docs/`、`.scratch/` |

### 命名空間 `tn`

- storage key：`tn:<key>`。在 tn 檔案內直接呼叫 `useWebExtensionStorage('tn:<key>', default)`，**不要**加進 `src/logic/storage.ts`。
- webext-bridge 訊息名：`tn:<name>`，宣告在 `types/tn-shim.d.ts`。
- 側欄頁 key：`tn-<name>`；popup 元件：`Tn<Name>`；HTML entry 目錄：`tn<Name>`。

### 寫 tn 程式碼的注意事項

- `src/tn/` **不會**被 auto-import，一律顯式 import。`src/composables/` 只掃頂層，不要把 tn 檔放進去。
- `pnpm bp` 不做型別檢查，漏 import 只會在 runtime 報錯。所以**必須跑 `pnpm tc`**。乾淨 clone 必須先 build 一次，產生 `types/auto-imports.d.ts`，`tc` 才不會誤報。
- UI 文字用繁體中文，直接寫死，不引入 i18n。

## 3. 掛鉤點白名單（唯一允許修改的 upstream 檔案）

每處只加 import 與最少的呼叫行，並加上 `[TN]` 標記（§4）。

| 檔案 | 允許的修改 |
|---|---|
| `src/background/index.ts` | 在既有 `onMessage('express')` handler 的 `unpack(...)` 後加 `tnUnpack(res.data as string)`；在 `setup*Listener()` 清單尾加 `setupTnBackground()`；對應的 import |
| `src/views/sidePanel/main.vue` | 在 `downViewList` 開頭加 `...tnViewList,`；對應的 import |
| `src/contentScripts/index.ts` | 需要 DOM 擷取時加一行 `setupTnContentScript()`；對應的 import |
| `AGENTS.md` | 尾端一行指向本檔 |

- **不可**另外呼叫 `onMessage('express', ...)`。webext-bridge 6.0.1 每個訊息名只保留一個 handler，後註冊的會靜默取代 upstream 的 `unpack`（見 ADR-0003）。
- `tnUnpack` 要包在自己的 try/catch 內，不可影響 upstream 的 `unpack`。
- Chrome 原生事件（`chrome.webRequest.onCompleted`、`chrome.contextMenus.onClicked` 等）可多處註冊。tn 的監聽一律寫在 `setupTnBackground()` 裡。
- 需要動白名單以外的 upstream 檔案：**停下來問使用者**。同意後：(1) 把該位置加進上表；(2) 寫一份 ADR 說明原因。

## 4. `[TN]` 標記

- 單行：行尾加 `// [TN]`；Vue template 用 `<!-- [TN] -->`。
- 多行：用 `// [TN] begin` … `// [TN] end` 包起來。
- 查全部修改：`grep -rn "\[TN\]" src types`；實際差異：`git diff upstream/main...HEAD`。

## 5. 禁止修改的 upstream 檔案（非窮舉）

- 建置與設定：`vite.config*.mts`、`package.json` 的 `scripts`、`tsconfig.json`、`eslint.config.js`、`uno.config.ts`、`.github/`、`scripts/*.ts`（`scripts/tn/` 除外）。
- 熱點：`src/composables/useDataCenter.ts`、`useBattleLog.ts`、`useParty.ts`、`format.ts`、`useUtils.ts`；`src/logic/storage.ts`；`src/constants/*`；既有 `types/modules/*.d.ts`、`types/shim.d.ts`、`types/global.d.ts`。
- 發版：`manifest.json`、`changelog.json`（見 ADR-0005）。新權限或新 host 視為白名單外修改，要先問。
- 既有 views 與元件：`src/views/**`、`src/components/**` 的既有檔案。
- 因此 **tn 不做 combatPanel 元件**，因為需要改 `constants/index.ts` 與 `extension.d.ts`。tn popup 一律用預設 800×800，因為非預設尺寸要改 `useUtils.ts`。

## 6. 使用 upstream 程式碼

- 只有 `src/tn/core/upstream.ts` 可以 import upstream 模組（`~/logic`、`~/composables/*`、`~/constants/*`、upstream 型別），其他 tn 檔一律從它取用。
- upstream 的 storage ref 一律**唯讀**，tn 不寫入任何 upstream 的 storage key。
- **禁止 import `~/api`**，`upstream.ts` 也不轉出。`src/api/request.ts` 會把 `uid` 和引繼碼送到 upstream 作者的伺服器。tn 工具預設純本機，需要後端時另開 ADR。

## 7. 同步 upstream

時機：upstream 出現版號 bump commit（`chore: 更新版号x.y.z`）之後，以及開始新工具之前。side panel 的新版提示（`useVersionCheck`）可以當作訊號。

```bash
git fetch upstream
git switch -c sync/upstream-YYYYMMDD main
git merge upstream/main
```

衝突處理：

- 非白名單檔：一律取 upstream 版本（`git checkout --theirs <file>`）。
- 白名單檔：取 upstream 版本，再重新套上 `[TN]` 行。
- `pnpm-lock.yaml`：先 `git checkout --theirs pnpm-lock.yaml`，再 `pnpm install` 重新產生，不手動合併。

驗證（全部通過才開 PR 合回 `main`）：

```bash
pnpm install
pnpm bp
pnpm tc
pnpm lint
```

merge commit 訊息：`chore(sync): merge upstream <upstream 短 hash>`。

## 8. 依賴

- 先用既有套件：`lodash-es`、`@vueuse/core`、`element-plus`、`cheerio`、`echarts`、`dayjs` 等。
- 新增套件前**必須問使用者**。同意後一律用 `pnpm add -D`（upstream 全部套件都在 `devDependencies`），並登記在下表。

| 套件 | 用途 | 加入日期 |
|---|---|---|
| （尚無） | | |

## 9. 回饋 upstream

- 只回饋 **upstream 程式碼的 bug fix**；tn 工具不回饋。
- 從 `upstream/main` 開 `upstream-pr/<slug>`，照 upstream 風格寫（簡中、`feat:`/`fix:`），PR 開到 upstream。
- fork 端修正的取得方式有兩種：cherry-pick 該 commit，或等下次同步。不在 `main` 上直接修 upstream 檔案。

## 10. 版號與發版

- fork 只自用，以解壓縮方式載入 `dist/`，不另外發版。
- **禁止推送 `x.y.z` 格式的 tag**，否則會觸發 `.github/workflows/release.yml`。fork 需要 tag 時用 `tn-v*`。

## 11. Commit

- Conventional Commits，訊息用繁體中文。
- tn 工具：`feat(tn-<tool>): ...`、`fix(tn-<tool>): ...`。
- 修改掛鉤點：scope 用 `hook`，例如 `feat(hook): 在 background 掛上 tnUnpack`。
- 同步：`chore(sync): merge upstream <短 hash>`。

## 12. Commit / PR 前檢查

```bash
git diff --name-only upstream/main...HEAD
```

列出的每個檔案都必須屬於 §2 的 fork 路徑或 §3 的白名單；不是的話，撤回該修改，或先問使用者。自動化腳本見 `.scratch/fork-guardrails/issues/01-check-upstream-diff.md`。

## 13. Agent skills 設定

- Issue tracker：本機 markdown，放在 `.scratch/<feature>/`。見 `docs/agents/issue-tracker.md`。
- Triage labels：預設五個（`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`）。見 `docs/agents/triage-labels.md`。
- Domain docs：單一 context，根目錄的 `CONTEXT.md` + `docs/adr/`。見 `docs/agents/domain.md`。
