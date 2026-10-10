# 01. 檢查 fork 是否修改了白名單以外的 upstream 檔案

Status: ready-for-agent
Type: task

## 目標

新增 `scripts/tn/check-upstream-diff.ts`。讀取 `git diff --name-only upstream/main...HEAD`，列出不屬於下列任一類的檔案，有的話 exit 1：

- fork 路徑：`docs/fork/RULES.md` §2，包括 `src/tn/**`、`src/views/sidePanel/views/tn-*/**`、`src/views/popup/components/Tn*.vue`、`src/views/tn*/**`、`types/modules/tn.d.ts`、`types/tn-shim.d.ts`、`scripts/tn/**`、`CLAUDE.md`、`CONTEXT.md`、`docs/**`、`.scratch/**`。
- 掛鉤點白名單：`docs/fork/RULES.md` §3。

## 限制

- 不修改 `package.json`。執行方式為 `npx tsx scripts/tn/check-upstream-diff.ts`；需要先驗證 `tsx` 在本 repo 能否直接執行，不能的話改用 `node` 可執行的 `.mjs`。
- 白名單檔案即使在清單內，也檢查其 diff 的新增行是否都帶 `[TN]` 標記；可以只做警告。

## 完成條件

- 在目前的 `main` 上執行，exit 0。
- 暫時修改一個非白名單 upstream 檔案後執行，exit 1 並列出該檔。
- `docs/fork/RULES.md` §12 改為引用本腳本。

## Comments
