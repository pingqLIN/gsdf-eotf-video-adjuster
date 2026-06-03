# GSDF EOTF Video Adjuster

把影片灰階重新整理成更穩定的 JND 階調，讓細微亮度差更容易分辨。

GSDF EOTF Video Adjuster 是一個精簡的 Chrome Manifest V3 extension 與本機 preview 工具，專注於顯示端感知亮度補救。當影片因後期調整不佳、螢幕 EOTF 不準確，或觀看環境不匹配而顯得暗部壓死、亮部不穩或階調不均時，它提供 Gamma 補償、目標亮度與 GSDF-inspired 灰階重新分布控制，讓亮度差異維持更穩定的可分辨性。

本專案的立論基礎是顯示端處理：它最佳化的是已經進入顯示路徑的訊號，而不是重新詮釋素材來源 coding。在一般 gamma 觀影基準之後，GSDF 階段會把可用灰階訊號處理成更接近人眼感知等距的 JND 階調，涵蓋暗部、中間調到亮部。

它適合作為特殊情境下的實用觀影補救工具，不取代正確調色、校正後的 mastering 或醫療顯示認證。此專案可以作為本機 standalone preview 執行；正式 extension 路徑則會把同一份 UI 打包成 Chrome extension iframe，並在偵測到的 video element 上注入受控 SVG filter。

## 它提供什麼

- 針對暗部、中間調或亮部階調分離不足的影片，提供顯示端 tonal rescue。
- 以 JND 為導向的 GSDF 灰階重新分布，讓細節分辨更穩定。
- GSDF 之前的 Gamma 補償控制：中央 `0 = gamma 2.2`，往左可到 gamma 3.0 的暗環境補償，往右可到 gamma 1.0 線性補償。
- 10 到 500 nits 的對數式目標亮度控制。
- Filter 總量控制：決定完整 GSDF output 與 gamma-adjusted signal 的混合比例。
- RGB 與 YCbCr/luma-only filter 路徑，可依觀影優先順序選擇。
- 黑位、白位、細節銳化與色溫偏移控制，用於實務補救微調。
- 精簡與展開版 GSDF 條紋測試視圖，方便視覺檢查。
- Chrome extension action fallback：頁面重載或 content script 尚未就緒時仍可嘗試啟動。

## 需求

- 建議使用 Node.js 22 或更新版本。
- npm。
- 只有執行 `npm run smoke:ext` 時需要 Google Chrome。

目前的 app 不需要 Gemini 或其他雲端 API key。

## 開發

安裝 dependencies：

```powershell
npm ci
```

啟動 standalone Vite app：

```powershell
npm run dev
```

開啟 `http://127.0.0.1:3000` 或 `http://localhost:3000`。

## Chrome Extension Build

建置 web app，並把產物複製到 `extension/ui`：

```powershell
npm run build:ext
```

接著在 Chrome 載入 `extension` 資料夾：

1. 開啟 `chrome://extensions`。
2. 啟用 Developer mode。
3. 選擇 Load unpacked。
4. 選取此 repo 的 `extension` 目錄。

在支援的網頁上點擊 extension action，即可切換 GSDF 控制面板。

## GSDF 模型

亮度模型說明請見 [docs/gsdf-model.ZHTW.md](docs/gsdf-model.ZHTW.md)。內容包含目的、DICOM PS3.14 來源公式、實作流程、專案內取捨與限制。

公式與 UI 應用審查請見 [docs/gsdf-application-and-ui-review.ZHTW.md](docs/gsdf-application-and-ui-review.ZHTW.md)。

## 驗證

執行快速測試：

```powershell
npm test
```

執行 TypeScript 驗證：

```powershell
npm run lint
```

執行 production web build：

```powershell
npm run build
```

建置 extension UI 後執行 extension smoke test：

```powershell
npm run build:ext
npm run smoke:ext
```

`smoke:ext` 會用暫存 profile 啟動 Chromium 或 Chrome、載入 unpacked extension、切換控制面板，並把截圖寫到 `output/playwright`。它會優先使用 `CHROME_PATH`；若未設定，會先嘗試最新的本機 Playwright Chromium，再退回預設 Google Chrome 路徑。

如果 browser 安裝在其他位置，請先設定 `CHROME_PATH`：

```powershell
$env:CHROME_PATH = 'C:\Path\To\chrome.exe'
npm run smoke:ext
```

如果受管理的 Google Chrome 擋下 command-line unpacked extension loading，可以把 `CHROME_PATH` 指到本機 Chromium build：

```powershell
$env:CHROME_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1217\chrome-win64\chrome.exe"
npm run smoke:ext
```

## 專案結構

- `src/`：standalone React UI 與共用 GSDF model helpers。
- `extension/manifest.json`：Manifest V3 extension 定義。
- `extension/background.js`：extension action click 啟動與 injection fallback。
- `extension/content.js`：注入 iframe UI 並套用受控 video filters。
- `scripts/buildExt.js`：把 Vite build 複製到 extension package。
- `scripts/smokeExtensionChrome.mjs`：執行真實 Chrome extension smoke test。
- `tests/`：Node regression tests，涵蓋 model、content script、background script、manifest 與 panel layout。
