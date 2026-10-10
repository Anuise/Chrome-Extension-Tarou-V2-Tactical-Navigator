# 0006. 只把 upstream 程式碼的 bug fix 回饋給 upstream

- 狀態：已採納
- 日期：2026-10-10

## 背景

fork 修改 upstream 檔案會增加衝突面（ADR-0003）。但開發 tn 工具時，可能會發現 upstream 程式碼本身的 bug。如果在 fork 的 `main` 上直接修，這份差異會一直存在；如果被 upstream 吸收，下次同步後差異就會消失。

## 決策

1. upstream 程式碼的 bug fix 從 `upstream/main` 開 `upstream-pr/<slug>` 分支，照 upstream 的風格（簡中、`feat:`/`fix:`）寫，PR 開到 upstream。分支不得含任何 tn 程式碼。
2. fork 端取得修正的方式有兩種：cherry-pick 該 commit，或等下次同步。不在 `main` 上直接修 upstream 檔案。
3. tn 工具不回饋 upstream。

## 後果

- fork 對 upstream 檔案的差異只剩掛鉤點白名單。
- 如果 upstream 不接受 PR，cherry-pick 進來的修正會成為長期差異。發生時要問使用者，是否把該位置列入白名單並寫 ADR。
