# 0008. tn 頁面經由 upstream 介面層重用 upstream 的 view 元件，不複製

- 狀態：已採納
- 日期：2026-10-11

## 背景

`tn-battle-script` 側欄頁需要顯示 boss 狀態，與 upstream「战斗信息」頁（`src/views/sidePanel/views/combat/`）的 `BossCard` 等元件相同。直覺做法是整頁複製後再改。

## 決策

tn 頁面只經由 `src/tn/core/upstream.ts` import upstream 的 view 元件，不修改、不複製。RULES §6 所說的「upstream 模組」包含 `src/views/**`、`src/components/**` 的元件。

## 考慮過的選項

- 整頁複製到 fork 路徑：完全自主，但 upstream 對這些元件的修正與新副本適配不會同步，兩份程式碼會逐漸分歧。

## 後果

- upstream 改元件的 props 或搬檔時，tn 頁面可能壞掉；修正點集中在 `upstream.ts` 與使用處。每次同步 upstream 後跑 `pnpm tc` 可抓到 props 型別變化。
- 若某元件需要 tn 專屬行為，改為在 tn 頁面包一層，不修改 upstream 元件。
