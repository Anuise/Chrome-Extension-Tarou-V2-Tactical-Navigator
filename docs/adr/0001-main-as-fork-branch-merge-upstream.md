# 0001. `main` 作為 fork 產品分支，以 merge 同步 upstream

- 狀態：已採納
- 日期：2026-10-10

## 背景

fork 的 `main` 已推上 origin，並透過 PR 合併過 fork 自有的 commit（`4cef1aa`）。截至 2026-10-10，fork 與 upstream 完全同步（merge-base 即 `upstream/main` = `50620ab`），沒有程式碼分歧。upstream 近 12 個月有 184 個非 merge commit，集中在發版前後，每次發版都會產生 `chore: 更新版号x.y.z` commit（`docs/research/architecture.md` §5、§6）。

## 決策

1. `main` 是 fork 產品分支，包含 upstream 全部內容與 fork 程式碼。upstream 只用 remote ref `upstream/main` 追蹤，不另建鏡像分支。
2. 同步一律 `git merge upstream/main`，禁止 rebase `main`、禁止 force push `main`。
3. 同步在 `sync/upstream-YYYYMMDD` 分支進行，`pnpm install && pnpm bp && pnpm tc && pnpm lint` 全部通過後，以 PR 合回 `main`。
4. 同步時機：upstream 每次發版（出現版號 bump commit）之後，以及開始新 tn 工具之前。不追 upstream 未發版的中間 commit。
5. 衝突處理：非白名單檔取 upstream 版本；白名單檔取 upstream 版本後重新套上 `[TN]` 行；`pnpm-lock.yaml` 取 upstream 版本後 `pnpm install` 重新產生。

## 考慮過的替代方案

- **`main` 保持 upstream 鏡像，另開 `fork` 分支開發**：origin 的 `main` 已有 fork commit，且 GitHub 預設分支與 PR 目標都要改；`upstream/main` 本身已經是鏡像。
- **rebase fork commit 到 upstream 上**：會改寫已推送歷史，每次同步都要 force push，也會打斷進行中的功能分支。

## 後果

- `git log --first-parent main` 可以看清 fork 自己的軌跡；fork 差異可用 `git diff upstream/main...main` 檢視。
- 歷史會有 merge commit，這是刻意的。
- 改用 rebase 或改分支模型需要重寫歷史，難以回頭，因此記為 ADR。
