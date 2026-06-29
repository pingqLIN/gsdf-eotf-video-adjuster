# 專案線與歸檔地圖

本 repo 以 Chrome 擴充功能作為主線，衍生工作要放進明確資料夾，不再散落在 repo root。

| 線別 | 目的 | Git / worktree 意圖 | 主要路徑 |
|---|---|---|---|
| `main` | 處理動態影像的瀏覽器擴充功能，用於人眼感知導向的細節分離與觀看輔助。 | `main` 保持為可發布的擴充功能主線；功能開發可先在 `codex/*` 分支完成再合併。 | `src/`, `extension/`, `scripts/buildExt.js`, `tests/`, `docs/gsdf-model.md` |
| `test-pattern` | 由 paper-style 視覺測試圖延伸出的動態樣本，用於檢查階調流失與擴充功能目標辨識。 | 只有當測試圖需要和擴充 UI 開發分離時，才建立獨立 `test-pattern` branch/worktree。 | `src/components/ToneLossTestPage.tsx`, `tests/tone-loss-test-page.test.mjs`, `docs/test-patterns.zh-tw.md` |
| `dynamic-icc-profile` | 依目前瀏覽器擴充設定產生靜態 ICC profile snapshot。 | 匯出器實作進 app 之前，先把設計輸入與轉換工具和 runtime 分開。 | `docs/icc-lut/`, `tools/icc-lut/` |
| `eizo-cg-1d-lut` | 產生 EIZO ColorNavigator 可讀的一維 Gamma/EOTF LUT CSV，供 CG 系列特殊顯示器使用。 | 視為特殊顯示器衍生線，不混入瀏覽器擴充 runtime。 | `docs/icc-lut/`, `docs/icc-lut/templates/`, `tools/icc-lut/` |

## 歸檔規則

- 擴充功能 runtime 程式碼保留在 `src/` 與 `extension/`。
- paper-style 與視覺檢查頁保留在 `src/components/`，並在 `tests/` 放置聚焦 route 測試。
- ICC / EIZO 規格放在 `docs/icc-lut/`。
- 可重複使用的轉換腳本放在 `tools/icc-lut/`。
- 產生物或重複封包預設留在 `.clean/` 本機歸檔，除非有明確理由納入版本控制。
- 任一衍生線合回主擴充功能分支前，可行時先跑 `npm run lint`、`npm test`、`npm run build:ext`。
