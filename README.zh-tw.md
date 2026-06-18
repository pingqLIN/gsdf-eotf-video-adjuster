[![GSDF EOTF Video Adjuster 橫幅](assets/readme-banner.png)](assets/readme-banner.png)

# LumaLift

**GSDF EOTF Video Adjuster，以 LumaLift 作為對外展示名稱。**

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square)
![Chrome 擴充功能](https://img.shields.io/badge/Chrome-Extension-34A853?style=flat-square)
![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)
![License](https://img.shields.io/badge/License-GPLv3-blue?style=flat-square)

**讓暗部現形。不動原始檔，直接在瀏覽器內調整亮度感知曲線。**

LumaLift 是一個 Chrome 擴充功能，會即時對瀏覽器影片套用 **GSDF/EOTF 感知式階調映射**。暗場、霧氣、低對比串流等場景，可以透過本機顯示端重映射補回陰影與霧中細節；不需上傳、不依賴雲端，也不重新編碼來源影片。

[總覽](#-總覽) · [DEMO](https://github.colorgeek.co/gsdf-eotf-video-adjuster/) · [快速開始](#-快速開始) · [權限](#-權限與隱私) · [功能](#-功能) · [截圖](#-截圖) · [控制項](#-控制項) · [架構](#-架構) · [開發](#-開發) · [文件](#-文件) · [English](README.md)

---

## 🎯 總覽

**LumaLift** 是 **GSDF EOTF Video Adjuster** 的對外產品名稱。它會透過精簡的 Manifest V3 控制面板，重新整理瀏覽器影片的可見亮度反應。目標是實務觀看補救：霧氣很重的畫面、暗部壓死、亮部洗白、顯示器 EOTF 行為不穩，或觀看環境讓細微灰階差異變得難以分辨。

它建立在 **Grayscale Standard Display Function（GSDF）** 感知模型之上，也就是 DICOM Part 14 顯示標準背後的灰階感知模型，並結合 **Electro-Optical Transfer Function（EOTF）** 校正概念。LumaLift 聚焦於本機、可回復的觀看輔助，而不是修改來源影片。

| 能力 | 說明 |
|---|---|
| **GSDF 啟發式亮度重映射** | 依照目標亮度與 JND 間距重建 256 階轉換表，讓暗部、中間調與亮部有更穩定的灰階分離 |
| **選用 Gamma 補償** | 以一般 gamma 觀影基準為起點，額外修正素材、播放鏈路或觀看條件造成的 gamma 偏差 |
| **Filter amount 混合** | 將完整 GSDF 結果混回 Gamma 調整後的基準，避免完整校正過強 |
| **Iframe 控制面板** | 在頁面上注入可拖曳的擴充功能介面，支援精簡 A 模式、雙欄 B 模式與展開 C 檢查工作區 |
| **檢查圖樣** | 提供輸出條紋、固定校正條紋、全域 GSDF-QC 圖樣與即時曲線圖，讓設定更容易被目視驗證 |

> **建議：** 請把它當成觀看輔助工具，而不是母帶製作、顯示器校正、HDR 量測或 DICOM 合規工具。優先使用能恢復必要細節的最低校正量。

---

## ⚠️ 限制

這個擴充功能是瀏覽器端的觀看輔助工具。

它不會：

- 校正顯示器，
- 量測 HDR 或 SDR 亮度，
- 認證 DICOM PS3.14 合規，
- 取代顯示器品管，
- 修改來源影片檔案，
- 保證所有播放器、DRM 畫面、Canvas 繪製或網站自訂影片流程都有一致結果。

相容性取決於各網站如何呈現影片。標準 HTML video 元素是主要目標；跨來源框架、DRM 播放、Canvas 繪製，以及較強勢的主頁樣式，都可能限制或改變可見效果。

---

## 🚀 快速開始

### 安裝

```powershell
# 如果從 Git 開始，請先 clone 專案
git clone <repo-url>
cd gsdf-eotf-video-adjuster

# 安裝相依套件
npm ci

# 將擴充功能介面建置到 extension/ui
npm run build:ext
```

接著載入未封裝的擴充功能：

```text
1. 開啟 chrome://extensions
2. 啟用「開發人員模式」（Developer mode）
3. 選擇「載入未封裝項目」（Load unpacked）
4. 選取本專案的 extension/ 目錄
5. 開啟影片頁面
6. 點擊擴充功能按鈕，切換 GSDF 控制面板
```

### 日常使用

| 步驟 | 操作 |
|---|---|
| **啟用校正** | 將面板開關從待命切到啟用 |
| **設定目標亮度** | 調整 `Lmax`，範圍為 `10..500 nits` |
| **必要時微調 Gamma** | 保持 `0 = gamma 2.2` 作為中性基準；只有在來源、播放鏈路或觀看條件需要 gamma 偏移時才調整 |
| **溫和混合** | 如果完整 GSDF 轉換表太強，降低 Filter amount |
| **先檢查再相信** | 檢視條紋預覽、校正條紋、全域圖樣與曲線圖 |

---

## 🔐 權限與隱私

擴充功能需要存取網頁，才能偵測 HTML video 元素、注入控制面板，並把受控的 SVG/CSS 濾鏡鏈套用到目前頁面。

| 權限 | 用途 |
|---|---|
| `activeTab` | 讓工具列按鈕可以作用於目前分頁 |
| `scripting` | 必要時注入或重新注入 content script |
| `<all_urls>` 網站存取 | 讓 content script 能在支援的影片頁面上運作 |

不需要雲端 API key。此擴充功能在瀏覽器本機執行，但仍應視為觀看輔助工具，而不是醫療校正、DICOM 合規或診斷顯示器驗證工具。

---

## ✨ 功能

### 🧠 感知式階調模型

| 功能 | 說明 |
|---|---|
| **JND 導向的 GSDF 轉換表** | 將 DICOM PS3.14 的亮度/JND 關係改寫為瀏覽器 SVG 元件轉換表 |
| **Gamma 前級補償** | 在 GSDF 之前套用 `gammaTarget`，讓補救層保留熟悉的影片觀看基準 |
| **全域 Filter amount** | `0%` 保留 Gamma 調整後訊號，`100%` 套用完整 GSDF 轉換表，中間值在兩者之間混合 |
| **對數式亮度滑桿** | 在低亮度目標提供更細緻的控制，適合昏暗觀看環境與低對比素材 |

### 🎛 控制介面

| 區域 | 說明 |
|---|---|
| **A 模式** | 預設單面板：狀態、亮度、Gamma、Filter amount、條紋預覽與基本/進階分頁 |
| **B 模式** | 雙欄面板：基本控制與進階影像控制並排顯示 |
| **C 模式** | 展開工作區：左側控制欄，中央顯示 GSDF-QC 圖樣與曲線視圖 |
| **主題與語言** | 深色/淺色面板，加上英文、繁體中文、簡體中文與日文介面字串 |

### 🧪 視覺檢查

| 介面 | 說明 |
|---|---|
| **輸出預覽條紋** | 由目前生效的轉換表產生，會跟隨亮度、Gamma 與 Filter 設定 |
| **校正條紋** | 固定低對比碼值配對，不受目前 GSDF 轉換表影響 |
| **完整 GSDF-QC 圖樣** | 多頻率灰階、調變、線對與漸層檢查 |
| **曲線圖** | 顯示輸入像素值與正規化輸出，並比較基準 Gamma 曲線與目前 GSDF 啟發式轉換表的輸出 |

---

## 📸 截圖

### 校正前 / 校正後對比

[![霧中山徑校正前後比較](assets/readme-before-after-foggy-trail.png)](assets/readme-before-after-foggy-trail.png)

*低對比地形與霧氣場景，用於觀察灰階分離是否更清楚。*

[![山霧校正前後比較](assets/readme-before-after-mountain-fog.png)](assets/readme-before-after-mountain-fog.png)

*霧氣與岩壁細節，用於判斷校正是否恢復層次，或是否推得太重。*

### 擴充功能控制面板

[![基本擴充功能面板](assets/readme-panel-basic.png)](assets/readme-panel-basic.png)

*A 模式：精簡待命面板，包含亮度、Gamma 補償、Filter amount 與條紋預覽。*

[![展開擴充功能工作區](assets/readme-panel-expanded-workspace.png)](assets/readme-panel-expanded-workspace.png)

*C 模式：左側控制欄加上中央 GSDF-QC 工作區，適合深入檢查。*

### 診斷視圖

[![完整診斷圖樣](assets/readme-diagnostic-pattern.png)](assets/readme-diagnostic-pattern.png)

*全域灰階、調變、線對與漸層診斷圖樣。*

[![完整曲線圖](assets/readme-curve-chart.png)](assets/readme-curve-chart.png)

*目前轉換表的即時曲線圖。*

### 資產註記

README 截圖與診斷圖片若未另行註明，皆為本專案文件資產。這些圖片只用於示範，不代表醫療校正、診斷顯示器驗證，也不保證所有影片內容都有相同結果。

---

## ⌨️ 控制項

目前尚未註冊全域鍵盤快捷鍵。擴充功能主要由注入頁面的控制面板操作。

| 控制項 | 作用 |
|---|---|
| **效果開關** | 啟用或停用目前影片校正 |
| **A / B / C 版面切換** | 選擇精簡、雙欄或展開檢查工作區 |
| **基本 / 進階分頁** | 在 A 模式中切換核心階調控制與影像細節控制 |
| **語言選單** | 不需重新建置即可切換介面語言 |
| **主題按鈕** | 切換深色與淺色面板 |
| **面板尺寸控制** | 調整浮動面板與展開視圖大小 |

---

## 🏗 架構

```text
src/
  App.tsx                         # React 外殼、設定儲存、擴充功能訊息橋接
  types.ts                        # 共用設定型別、GSDF/JND 計算、轉換表輔助函式
  components/
    DraggablePanel.tsx            # 擴充功能控制面板、版面、檢查覆蓋層
    GSDFChart.tsx                 # 可響應尺寸的轉換曲線圖
    VideoBackground.tsx           # 本機獨立預覽影片
  i18n/                           # 介面語言註冊與本地化文案
extension/
  manifest.json                   # Manifest V3 權限、action、content script、web resources
  background.js                   # Action 點擊啟動與注入備援
  content.js                      # Iframe 注入、影片偵測、受控 SVG 濾鏡鏈
  ui/                             # npm run build:ext 複製出的擴充功能介面
scripts/
  buildExt.js                     # 將 Vite 建置產物複製到 extension/ui
  smokeExtensionChrome.mjs        # 對未封裝擴充功能執行真實 Chrome/Chromium 冒煙測試
tests/
  *.test.mjs                      # Node 回歸測試，涵蓋模型、manifest、content、layout
docs/
  gsdf-model.md                   # 公式與實作說明
  gsdf-application-and-ui-review.md # GSDF 使用方式、限制與 UI 審查紀錄
```

### 模組總覽

| 模組 | 執行環境 | 角色 |
|---|---|---|
| `src/types.ts` | 共用應用模型 | 正規化設定、計算 GSDF 亮度/JND 映射、建立轉換表與條紋列 |
| `src/components/DraggablePanel.tsx` | React 介面 | 提供 A/B/C 面板版面、控制項、條紋預覽與檢查覆蓋層 |
| `extension/content.js` | 主頁 content script | 注入 iframe 介面、鏡像模型、偵測影片並套用受控濾鏡 |
| `extension/background.js` | 擴充功能 service worker | 處理 action 點擊，必要時重新注入 content script |
| `scripts/smokeExtensionChrome.mjs` | 驗證流程 | 啟動真實瀏覽器設定檔、載入未封裝擴充功能、切換面板並擷取證據 |

### 訊息流程

```text
使用者調整面板
  -> React iframe 發送 GSDF_SETTINGS_CHANGED
  -> content script 正規化設定並產生階調設定
  -> 更新 SVG 濾鏡定義
  -> 偵測或刷新目標影片
  -> 套用受控濾鏡鏈，且不覆蓋主頁原本的 filter
```

---

## 🧪 開發

### 需求

| 工具 | 需求 |
|---|---|
| **Node.js** | 已使用 Node.js 22.x 測試；較新的 active LTS 版本預期可運作 |
| **npm** | 安裝相依套件與執行腳本 |
| **Chrome / Chromium** | 執行擴充功能冒煙測試時需要 |
| **雲端 API key** | 不需要 |

### 指令

```powershell
# 啟動本機獨立預覽
npm run dev

# TypeScript 驗證
npm run lint

# Node 回歸測試
npm test

# 網頁正式建置
npm run build

# 建置未封裝擴充功能資產
npm run build:ext

# 啟動真實 Chrome/Chromium 擴充功能冒煙測試
npm run smoke:ext
```

若 Windows 上受管理的 Google Chrome 阻擋命令列載入未封裝擴充功能，請使用輔助包裝器：

```powershell
npm run smoke:ext:env
```

冒煙測試執行器會把本機證據寫到 `output/playwright/`。

---

## 📄 文件

| 文件 | 說明 |
|---|---|
| [PRODUCT.md](PRODUCT.md) | 產品定位與介面意圖 |
| [docs/gsdf-model.md](docs/gsdf-model.md) | GSDF 公式來源、瀏覽器近似與實作流程 |
| [docs/gsdf-model.ZHTW.md](docs/gsdf-model.ZHTW.md) | 繁體中文 GSDF 模型說明 |
| [docs/gsdf-application-and-ui-review.md](docs/gsdf-application-and-ui-review.md) | 公式審查、UI 審查輸入、已實作修正與驗證紀錄 |
| [docs/gsdf-application-and-ui-review.ZHTW.md](docs/gsdf-application-and-ui-review.ZHTW.md) | 繁體中文審查紀錄 |

---

## 🤝 貢獻

歡迎貢獻。若變更會影響 GSDF 模型、瀏覽器濾鏡行為、權限或擴充功能啟動流程，請先開議題討論。

---

## 🤖 AI 輔助開發

本專案在開發過程中使用 AI 輔助。

| 模型 | 角色 |
|---|---|
| OpenAI Codex | 實作支援、文件重寫、截圖流程與本機驗證 |
| ChatGPT 5.5 Pro 網頁版 | 外部 README 審查，涵蓋限制措辭、權限與隱私揭露、繁中清晰度，以及公開定位 |

> **免責聲明：** 作者已盡力審查與驗證 AI 生成的程式碼，但仍無法保證其正確性、安全性，或適用於任何特定目的。請自行評估風險後使用。
> 外部 AI 審查不代表背書、認證、安全稽核、醫療驗證或 DICOM 合規評估。

---

## 📜 授權

[GNU General Public License v3.0 only](LICENSE)。若要以專有或閉源形式進行商業再散布，需另行取得著作權人的商業授權。
