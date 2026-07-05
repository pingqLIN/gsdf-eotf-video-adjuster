# GSDF/CSDF Chart Guide Design

日期：2026-07-05

## 目標

新增一份繁體中文使用與技術邊界混合型文件：

`docs/gsdf-csdf-chart-guide.zh-tw.md`

這份 guide 要讓使用者看懂 GSDF/CSDF 圖表各區塊代表的意義，並能把圖表判讀對照到 Chrome 擴充功能的日常操作。文件也要明確說明繪製區哪些畫面會受目前調整影響，哪些畫面保持固定參考。

正式 guide 必須加入配圖。配圖可以使用既有 extension 截圖、重新擷取的真實 UI 截圖、專案自製示意圖，或可操作的 HTML 說明元件；選擇時優先使用能長期維護、能清楚解釋概念、且不暗示醫療校正結果的素材。

## 讀者與語氣

主要讀者是想使用 LumaLift 調整影片的使用者，次要讀者是維護此專案的開發者。前半採教學語氣，少公式、多操作對照；後半補足技術邊界，避免把參考圖或曲線誤解為校正證書。

文件使用繁體中文，必要技術詞保留 English，例如 `GSDF`, `CSDF`, `Lmax`, `Gamma compensation`, `Filter amount`, `transfer table`, `normalized output`, `HTML video`, `DICOM validator`。

## 文件位置與關聯

正式文件新增於：

- `docs/gsdf-csdf-chart-guide.zh-tw.md`

不修改核心模型、extension runtime、現有圖表元件或 README。若後續需要曝光此文件，另開一個小變更把它加到 README 文件索引。

文件應交叉參照既有資料，而不是重複完整公式：

- `docs/gsdf-model.ZHTW.md`
- `README.zh-tw.md`
- `src/components/GSDFChart.tsx`
- `src/types.ts`
- `extension/content.js`

配圖或互動說明素材可放在：

- `docs/assets/`
- `docs/demo/`

若使用既有 README assets，需確認它們仍準確代表目前 UI；若新增示意圖或 HTML，應使用專案自有文字與圖形，不從外部來源複製素材。

## 內容架構

### 1. 這份圖表在看什麼

說明 GSDF/CSDF 圖表用來觀察目前 transfer table 如何把 input pixel value 映射到 output value。它是目視判讀與操作輔助，不是顯示器校正報告、醫療驗證或 DICOM 合規證明。

### 2. 曲線圖各區塊意義

解釋曲線圖元素：

- X 軸：`input pixel value`，代表輸入碼值，範圍 `0..255`。
- Y 軸：`normalized output`，代表輸出正規化值，範圍 `0..1`。
- `Standard sRGB` 或基準線：用來比較一般輸入到輸出關係。
- `GSDF remap` / `CSDF remap` 線：目前 active transfer table 的取樣結果。
- 圖例：指出目前顯示的是 GSDF 或 CSDF 重映射。
- `Include levels`：把 black/white point 後級 levels 納入曲線視圖，用於觀察額外裁切或拉伸後的輸出。

配圖要求：

- 至少加入一張曲線圖配圖。可重用 `assets/readme-curve-chart.png`，或重新擷取目前 extension 的 full chart overlay。
- 圖說必須標出 X 軸、Y 軸、基準線、active remap 線與 `Include levels` 對判讀的影響。

### 3. GSDF 與 CSDF 在擴充功能中的差異

以使用者能理解的方式說明：

- `GSDF` 是灰階或亮度導向路徑，可走 RGB 或 YCbCr-style luma/chroma 管線。
- `CSDF` 是目前預設色彩路徑，會把同一張 active transfer table 套到 R/G/B channel。
- `displayGamut` 在 GSDF YCbCr 路徑會影響 luma coefficients；在目前 CSDF RGB route 中不是獨立的 3D 色彩 LUT。
- 專案的 CSDF 是 browser-executable approximation，不宣稱完整 CSDF calibration。

### 4. 對照擴充功能的使用方式

以日常操作順序說明控制項：

- `Enable`：決定是否把受控 filter chain 套到目標 HTML video。
- `Lmax`：決定建立 GSDF/CSDF transfer table 的目標峰值亮度。
- `Gamma compensation`：GSDF/CSDF 前的輸入端偏差修正，中心值保留一般 gamma 觀看基準。
- `Filter amount`：把完整 remap 與 gamma-adjusted baseline 混合。
- `GSDF/CSDF route`：選擇亮度導向或色彩路徑。
- `GSDF pipeline`：只在 GSDF route 下說明 RGB 與 YCbCr-style 管線差異。
- `Display gamut`：說明它對 luma coefficients 與文件判讀的影響。
- `Black/White point`：後級 levels，不屬於 DICOM GSDF 公式。
- `Dither Beta`：輸出端 Beta 選項，會影響實際影片路徑與 CMY/RGB 連續漸層參考圖。

配圖要求：

- 至少加入一張 extension 面板或工作區配圖。可重用 `assets/readme-panel-basic.png` 或 `assets/readme-panel-expanded-workspace.png`，也可以重新截圖。
- 圖說要把面板控制項對應到本節文字，不只放裝飾性截圖。

### 5. 繪製區是否受調整影響

正式文件必須用文字分組加上一張示意配圖或可操作 HTML 輔助理解。若使用 HTML，guide 仍需提供靜態截圖或明確連結，避免讀者只能靠執行互動頁面才看得懂。

會受目前調整影響：

- 曲線圖中的 active remap 線。
- 輸出預覽條紋。
- CSDF 視覺線性圖樣。
- CMY/RGB 連續漸層圖樣，尤其啟用 Dither Beta 時。
- 實際 HTML video 上的 managed SVG/CSS filter chain。

不受目前 GSDF/CSDF table 影響或保持固定參考：

- 亮度校正條紋。
- 固定低對比 code-value pair。
- 用於檢查顯示縮放或幾何狀態的固定參考邊界。

需要特別註明：固定參考不是沒有用，而是用來避免所有檢查畫面都跟著設定一起移動，讓使用者仍有穩定的比較基準。

配圖要求：

- 新增一張「會受調整影響 / 固定參考」分區示意圖，建議放在 `docs/assets/gsdf-csdf-affected-surfaces.svg` 或同名 PNG。
- 若製作可操作 HTML，建議放在 `docs/demo/gsdf-csdf-chart-guide.html`，讓使用者切換 `Lmax`, `Gamma`, `Filter amount`, `Include levels`, `Dither Beta`，並以標籤顯示哪些區域跟著變動、哪些區域固定。

### 6. 判讀提醒與限制

收斂到使用者決策：

- 先用最低足夠強度恢復暗部或霧中細節。
- 曲線變化不等於畫質分數。
- 瀏覽器、GPU path、播放器、DRM、Canvas/WebGL 與 OS scaling 都可能改變可見結果。
- 這不是 colorimeter、DICOM validator、CSDF verifier 或 medical display QA workflow。

## 實作邊界

這次正式實作可新增文件與必要配圖或互動說明素材，但不修改核心 runtime：

- `src/types.ts`
- `src/components/GSDFChart.tsx`
- `extension/content.js`
- build scripts

未追蹤的 `devgov-service-control-modal.png` 已移入 ignored `.clean/local-artifacts-20260705-001/`，不納入公開文件或 commit。

若新增截圖或示意圖，檔名應清楚描述用途，並放在 `docs/assets/`；若新增可操作 HTML，應放在 `docs/demo/`，保持純前端、無外部服務依賴。

## 驗證方式

文件完成後執行：

- `git diff --check`
- Markdown 內容自審：確認沒有占位標記、定義不足的章節或與現有模型文件衝突的說法。
- 若新增 HTML 說明元件，至少用本機瀏覽器或 Playwright 檢查畫面可載入、沒有遮擋、文字不溢出。
- 若新增或重用圖片，確認 Markdown image path 正確，且圖說不宣稱醫療校正、DICOM 合規或完整 CSDF calibration。
- 如文件索引未修改、且沒有改 extension runtime，不需要重新建置 extension。

## 完成條件

- 新增 `docs/gsdf-csdf-chart-guide.zh-tw.md`。
- 正式 guide 至少包含三類視覺輔助：曲線圖配圖、extension 控制面板配圖、會受調整影響與固定參考的分區示意圖或可操作 HTML。
- 文件能清楚回答圖表各區塊代表什麼。
- 文件能對照擴充功能控制項的使用方式。
- 文件明確分辨會受調整影響與不受調整影響的繪製區。
- 文件不宣稱醫療校正、DICOM 合規或完整 CSDF calibration。
