# 0005. 不修改 manifest 與 changelog，fork 不另外發版

- 狀態：已採納
- 日期：2026-10-10

## 背景

- `manifest.json` 近 12 個月 19 次修改，19 次全是版號 bump（`docs/research/architecture.md` §5.5）。fork 只要改到 `manifest.json:4` 的版本行，upstream 每次發版都會衝突。`changelog.json` 也是一樣。
- `.github/workflows/release.yml` 的觸發條件是 `push: tags: ['*.*.*']`。fork 的 Actions 是開啟的，所以推送 `x.y.z` tag 就會在 fork 觸發發版流程。fork 沒有設定 secrets，推論 OSS 上傳步驟會失敗（未實跑）。
- `src/composables/useVersionCheck.ts:34` 寫死抓 upstream 的 `changelog.json`。

## 決策

1. fork 只供自用，以解壓縮方式載入 `dist/`，不另外發版。
2. 不修改 `manifest.json` 與 `changelog.json`，版本號與名稱沿用 upstream。新增權限或 host 屬於白名單外修改，要先問使用者並寫 ADR。
3. 禁止推送 `x.y.z` 格式的 tag。fork 需要 tag 時用 `tn-v*`。
4. `useVersionCheck` 顯示 upstream 有新版時，當作同步 upstream 的訊號（ADR-0001）。

## 後果

- fork 的 build 和同版號的 upstream build 在 manifest 上無法區分。
- 如果日後要把 fork 給別人使用，需要新的 ADR，例如改成建置後修補 `dist/manifest.json`，並處理 `useVersionCheck` 的來源。
