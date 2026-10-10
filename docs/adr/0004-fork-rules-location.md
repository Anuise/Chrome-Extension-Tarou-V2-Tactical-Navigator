# 0004. fork 規則放在 `docs/fork/RULES.md`，不寫進 upstream 的 `AGENTS.md`

- 狀態：已採納
- 日期：2026-10-10

## 背景

fork 同時使用 Claude Code（讀 `CLAUDE.md`）與 Codex（讀 `AGENTS.md`）。`AGENTS.md` 是 upstream 檔案：upstream 在 `5bcbd28`（2026-01-13）把原本的 `CLAUDE.md` 改名為 `AGENTS.md`，之後仍會修改。fork 先前在 `AGENTS.md` 尾端加了 14 行「Agent skills」段落，upstream 修改檔尾時會衝突。

upstream 沒有 `CLAUDE.md`、`CONTEXT.md`、`docs/`。Codex 的 `AGENTS.override.md` 會**取代** `AGENTS.md`，而不是合併，所以使用它就必須自己複製 upstream 內容，日後會漂移。

## 決策

1. 完整 fork 規則寫在 `docs/fork/RULES.md`（fork 路徑）。
2. 新建 fork 專屬的 `CLAUDE.md`，內容只有 `@AGENTS.md` 與 `@docs/fork/RULES.md` 兩個 import。
3. `AGENTS.md` 還原成 upstream 版本，只在尾端加一行指向 `docs/fork/RULES.md`，讓 Codex 也讀得到。原本的「Agent skills」段落搬進 `RULES.md` §13。
4. 專有名詞寫在 `CONTEXT.md`，決策寫在 `docs/adr/`。

## 後果

- 對 `AGENTS.md` 的修改只剩一行，衝突時容易重新套上。
- upstream 日後若再新增 `CLAUDE.md`，會與 fork 的 `CLAUDE.md` 衝突。機率低，發生時以 fork 版本為準，並把 upstream 內容併入 `@` import。
