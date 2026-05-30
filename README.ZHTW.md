# GSDF EOTF Video Adjuster

GSDF EOTF Video Adjuster 是一個 Vite/React 控制面板與 Chrome Manifest V3 extension，用來在網頁影片上套用感知亮度修正。它適合已知螢幕峰值亮度的檢視情境，讓影片反應更接近 DICOM GSDF 式的對比表現。

此專案可以作為本機 standalone preview 執行；正式 extension 路徑則會把同一份 UI 打包成 Chrome extension iframe，並在偵測到的 video element 上注入受控 SVG filter。

## 功能

- 10 到 500 nits 的對數式目標亮度控制。
- 相對補償模式：500 nits 保持中性，低亮度時逐步增加修正。
- 純 GSDF 模式：直接套用完整 transfer curve。
- RGB 與 YCbCr/luma-only filter 路徑。
- 黑位、白位、細節銳化與色溫偏移控制。
- 精簡與展開版 GSDF 條紋測試視圖。
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

`smoke:ext` 會用暫存 profile 啟動 Chrome、載入 unpacked extension、切換控制面板，並把截圖寫到 `output/playwright`。

如果 Chrome 不在預設 Windows 路徑，請先設定 `CHROME_PATH`：

```powershell
$env:CHROME_PATH = 'C:\Path\To\chrome.exe'
npm run smoke:ext
```

如果受管理的 Google Chrome 擋下 command-line unpacked extension loading，可以把 `CHROME_PATH` 指到本機 Chromium build。舉例來說，若已安裝 Playwright Chromium：

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
