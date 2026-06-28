# GSDF 模型說明

這份文件說明本專案為什麼使用 GSDF-inspired transfer model、公式來源，以及目前如何把模型實作成瀏覽器影片濾鏡。

## 目的

這個 extension 會調整網頁影片，讓暗部到亮部的灰階階調更接近感知亮度尺度。它的定位是實用的顯示預覽與視覺調整，不是醫療設備校正，也不宣稱 DICOM conformance。

對一般彩色影片來說，觀影目標仍應以 gamma-style response 為主。本 extension 是特殊情境下的補救工具，例如影片沒有經過良好後期調整、螢幕 EOTF 本身不準確，或觀看條件造成影像細節流失。因此本專案把 gamma `2.2` 視為中性基準，把 Gamma 補償視為選用的輸入端偏差修正，再把 GSDF 視為感知細節補救層。

GSDF 模型有用的原因是：一般影片 code value 並不等同於人眼感知上的等距亮度差。DICOM PS3.14 定義了 Grayscale Standard Display Function (GSDF)，用 Just-Noticeable Difference (JND) index 與 luminance 建立對應關係。本專案借用這個 luminance/JND 關係，產生瀏覽器影片可用的 SVG component-transfer table。

## 公式來源

來源是 DICOM PS3.14, Grayscale Standard Display Function：

- Current HTML standard: https://dicom.nema.org/medical/dicom/current/output/html/part14.html
- Current PDF standard: https://dicom.nema.org/medical/dicom/current/output/pdf/part14.pdf

PS3.14 定義 luminance `L`，單位為 `cd/m^2`，作為 JND index `j` 的函數；其中 `j` 的範圍是 `1..1023`。本專案實作的標準插值公式如下：

```text
log10(L(j)) =
  (a + c*ln(j) + e*ln(j)^2 + g*ln(j)^3 + m*ln(j)^4)
  /
  (1 + b*ln(j) + d*ln(j)^2 + f*ln(j)^3 + h*ln(j)^4 + k*ln(j)^5)
```

係數使用 PS3.14 的數值：

```text
a = -1.3011877
b = -2.5840191e-2
c =  8.0242636e-2
d = -1.0320229e-1
e =  1.3646699e-1
f =  2.8745620e-2
g = -2.5468404e-2
h = -3.1978977e-3
k =  1.2992634e-4
m =  1.3635334e-3
```

實作採用標準描述的 luminance range：約 `0.05` 到 `4000 cd/m^2`。目前 regression tests 會檢查模型端點：`JND 1 -> ~0.05 cd/m^2`、`JND 1023 -> ~3993 cd/m^2`。

## 實作方式

共用 TypeScript 實作在 [src/types.ts](../src/types.ts)。Chrome content script 在 [extension/content.js](../extension/content.js) 內保留同一套邏輯，因為它需要作為獨立 injected script 執行。

核心流程如下：

1. 用 `normalizeAppSettings` 正規化設定。
2. 視需要對每個 input code level 套用目前的 Gamma 補償。UI 會以置中的偏差 slider 表示：`0` 保留中性的 gamma `2.2` 基準，左端對應 gamma `3.0`，右端對應 gamma `1.0`。
3. 將 gamma-adjusted code level 映射到 display minimum 與 selected maximum luminance 之間的 target JND position。
4. 用 `gsdfJndToLuminance` 將 JND 轉回 luminance。
5. 將 luminance 正規化為 `0..1`。
6. 以 `pow(level, 1 / 2.2)` 轉成較適合 browser transfer table 的輸出值。
7. 用 filter 總量把完整 GSDF 結果混合回 gamma-adjusted level。
8. 產生 256 個數值，填入 SVG `feComponentTransfer` table。

第 6 步是 extension 的瀏覽器近似，不屬於 DICOM PS3.14 本身。它是把 GSDF 推導出的 luminance level 回編碼成瀏覽器輸出值的地方。使用者不需要先把 Gamma 補償設為 `1.0` 才能套用 GSDF；Gamma 補償是修正素材、播放鏈路或觀看條件偏差的額外控制。extension 不會量測實際網頁、GPU path、螢幕 EOTF、HDR 模式或環境光觀看條件。

重要函式：

- `gsdfJndToLuminance(jndIndex)`：計算 PS3.14 luminance equation。
- `luminanceToGsdfJnd(luminance)`：用 binary search 反解 luminance 對應的 JND。
- `getGammaAdjustedInputLevel(inputLevel, gammaTarget)`：套用 GSDF 之前的 Gamma 目標。
- `getGsdfDisplayCode(inputLevel, lmax)`：把單一 normalized code value 映射到 GSDF-shaped display code。
- `buildGsdfTableValues(settings, tableSize = 256)`：產生 UI、preview video、content script 與 chart 共用的 transfer table。
- `buildGsdfStripeRows(settings)`：產生帶有小幅 JND offset 的 stripe pairs，用於視覺檢查。

## 流程流水線圖

`src/types.ts` 雖然檔名像 type 定義，但它其實是共用模型核心。它負責 settings shape、輸入正規化、luminance/JND 計算、transfer table 產生，以及條紋列資料產生。runtime application 再從三個地方消費這些輸出：

- `src/components/VideoBackground.tsx`：用 SVG filters 渲染 standalone demo preview。
- `src/components/DraggablePanel.tsx`：把 settings 接成 UI 控制、輸出預覽條紋、亮度校準條紋與圖表 overlay。
- `extension/content.js`：鏡像同一套模型，並從 injected content script 把 SVG filters 套到真實頁面影片。

```mermaid
flowchart TD
  A["使用者控制<br/>enabled, lmax, gammaTarget, strength, displayGamut,<br/>blackPoint, whitePoint, sharpness, temperature,<br/>dither, ditherStrength, ditherColor, ditherNoise"] --> B["normalizeAppSettings / normalizeSettings"]
  B --> C["Gamma 前級補償<br/>0 = 2.2, left 3.0, right 1.0"]
  C --> D["Active transfer model<br/>src/types.ts and extension/content.js"]
  D --> E["buildActiveTransferTableValues(settings, 256)"]
  D --> F["buildGsdfStripeRows(settings)"]
  D --> G["buildGsdfCalibrationStripeRows()"]
  E --> H["Preview SVG transfer tables<br/>CSDF RGB 或 GSDF RGB/YCbCr"]
  E --> I["Extension SVG transfer tables<br/>deriveToneProfile()"]
  E --> J["GSDFChart sampled curve"]
  F --> K["輸出預覽條紋<br/>跟隨 active transfer table"]
  G --> L["亮度校準條紋<br/>固定低對比 code pairs"]
  I --> M["updateFilterDefinitions(profile)"]
  M --> N["buildManagedFilterChain(existingFilter, profile)"]
  N --> O["applyVideoFilter(video, profile)"]
  O --> P["Browser video element<br/>managed CSS filter chain"]
```

核心 table-generation loop 會先套用 Gamma 目標，再把調整後的 code value 送進 GSDF luminance relationship，最後轉成 SVG table value：

```mermaid
flowchart LR
  A["8-bit table index"] --> B["inputLevel = index / 255"]
  B --> C["gammaLevel = pow(inputLevel, gammaTarget / 2.2)"]
  C --> D["getGsdfDisplayCode(gammaLevel, lmax)"]
  D --> E["luminanceToGsdfJnd(minLuminance / lmax)"]
  E --> F["interpolate target JND"]
  F --> G["gsdfJndToLuminance(jnd)"]
  G --> H["normalize luminance to 0..1"]
  H --> I["pow(level, 1 / 2.2)"]
  I --> J["與 gamma-adjusted input 混合<br/>strength / 100"]
  J --> K["clamped 5-decimal table value"]
```

Chrome extension path 在同一個模型外面多了一層 runtime：它必須找到目標影片、保留 host page 原本的 filter token、注入可重用的 SVG definitions，並同步浮動 iframe panel 的大小與位置。

```mermaid
sequenceDiagram
  participant User as 使用者
  participant UI as React iframe UI
  participant Content as extension/content.js
  participant Page as Host page videos
  User->>UI: 調整面板控制
  UI->>Content: postMessage GSDF_SETTINGS_CHANGED
  Content->>Content: normalizeSettings + deriveToneProfile
  Content->>Content: updateFilterDefinitions
  Content->>Page: discoverVideos + selectTargetVideos
  Content->>Page: applyVideoFilter with managed SVG filter chain
  UI->>Content: GSDF_PATTERN_VIEW_CHANGED
  Content->>UI: resize iframe shell for large charts/patterns
```

視覺化表面刻意拆成兩種用途。輸出預覽條紋會從 active transfer table 取樣，所以會反映目前選到的 `gammaTarget`、`lmax`、`strength` 與 color path。亮度校準條紋則是固定 `+2` code-value reference，因此不受目前 GSDF table 影響，可作為穩定的亮度/對比檢查。

## 專案內的取捨

### 目標亮度

UI 提供的 `lmax` 範圍是 `10..500 nits`。這比 PS3.14 模型完整範圍窄，因為本 extension 目標是一般 web-video 顯示調整，不是診斷顯示器校正。

slider 使用 logarithmic scale。低亮度目標會有較細的控制，因為暗部感知差異更敏感。

### GSDF 之前的 Gamma 補償

UI 會把這個控制表述為 `Gamma 補償`，模型內部則儲存成實際的 `gammaTarget`。它刻意放在 GSDF 之前，但不是必需的手動線性化步驟。中央 `0` 代表 gamma `2.2`，也就是一般彩色影片觀影基準；往左會加深輸入反應，最高到 gamma `3.0`；往右會朝 gamma `1.0` 提亮輸入反應，如果來源已接近預期基準，可能過度抬升暗部。

```text
gammaCorrection = -100..0..+100
gammaCorrection -100 -> gammaTarget 3.0
gammaCorrection 0 -> gammaTarget 2.2
gammaCorrection +100 -> gammaTarget 1.0
gammaLevel = pow(inputLevel, gammaTarget / 2.2)
```

這不是螢幕量測結果，也不是把來源恢復成 scene-linear 素材。它是 GSDF table 之前的一個可控前級補償，用於素材、播放鏈路或觀看條件出現 gamma 偏差時的實務觀影補救。

### 完整 GSDF 與 Filter 總量

UI 只提供一套 GSDF 路徑。它會先套用選用的 Gamma 偏移，再依所選 target luminance 產生完整 GSDF-shaped table，將 luminance 結果回編碼成瀏覽器輸出值，最後用 user-facing filter 總量把完整 table output 與 gamma-adjusted input 混合。任何 target luminance 都不再被當作 neutral no-compensation point：

```text
filterAmount = strength/100
mixedLevel = gammaLevel + (gsdfLevel - gammaLevel) * filterAmount
```

`0%` 會保留 gamma-adjusted signal；`100%` 代表所選 `lmax` 下的完整 GSDF output。中間值是全域 GSDF filter 總量，不是低亮度相對補償規則。

若舊儲存設定含有 `curveMode: "pure"`，目前會正規化回這套單一 GSDF 路徑。使用者應調整 filter 總量，而不是在多套 GSDF 解讀之間切換。

### CSDF RGB 路徑與 GSDF 管線選項

`CSDF` 路徑是 native color path。它會把 active transfer table 直接套到瀏覽器 SVG `feComponentTransfer` 的 R、G、B channel，因此作用在 RGB cube，而不是先轉成 YCbCr 再只處理 luma。chart、輸出預覽條紋、CSDF 視覺線性圖樣與 CMY/RGB 連續漸層參考圖也會使用同一張 active table，所以 `gammaTarget`、`lmax` 與 `strength` 的變化會同時反映在影片與參考圖上。

`GSDF` 路徑則保留灰階導向的處理。它可以把同一張 transfer table 直接套到 RGB channel，或套到 YCbCr-style luma/chroma transform 的 Y component。`displayGamut` 選項會影響 GSDF YCbCr 路徑使用的 luminance coefficients。

這仍是瀏覽器可執行的 CSDF approximation，不是經認證的 CSDF calibration。已發表的 CSDF 提案會以 GSDF 作為 neutral gray behavior，並用 CIEDE2000 這類 color-difference metric 重新分配 RGB cube 內的 color lines。完整 workflow 需要 display characterization，通常也需要 3D transform 或 device LUT。本專案為了保持本機、可逆與 SVG filter 可執行，只提供實務上的 color-video remapping，不代表 display compliance 證明。

### Dither Beta

Dither Beta settings 是 Beta 輸出選項。在受控影片路徑中，它們會在 transfer、levels、temperature、color 與 sharpening 之後，追加一個小幅度 SVG `feTurbulence`/`feComposite` filter。standalone preview 也使用同一個最終 filter 位置。

Dither Beta 控制會顯示在 CMY/RGB 漸層參考圖視圖，而不是首頁輸出預覽曲線。控制項包含 Dither 主開關、1 到 5 的強度、`使用彩色` 與 `使用 Noise`。`使用彩色` 和 `使用 Noise` 是彼此獨立的 checkbox，因此可以單獨啟用其中一個，也可以兩個同時啟用。

啟用時，同一組設定會影響受控影片濾鏡路徑與漸層參考 canvas。強度大致對應 1 到 5 個 8-bit code value offset。`使用 Noise` 會加入亮度 noise 成分；`使用彩色` 會加入彩色 channel-offset 成分。漸層基底仍維持為單一平順滿版 CMY/RGB ramp，不加入反向長條、分隔線或其他結構性疊加元素。影片端實作標示為 Beta，因為目前 runtime 是 SVG/CSS filters，不是逐像素 WebGL 或 canvas shader；browser 與 GPU path 可能改變實際視覺紋理。

### Black/White Point、Sharpness、Temperature

這些控制是疊在 GSDF table 外面的 extension-specific 調整：

- Black/white point 使用 linear `feComponentTransfer` levels adjustment。
- Sharpness 會選擇不同強度的 `feConvolveMatrix` filter。
- Temperature 透過 `feColorMatrix` 套用 RGB channel gain。

它們不是 DICOM PS3.14 的一部分，而是本 extension 的影片調整控制。

## 限制與非目標

- extension 不會量測實體螢幕、環境光或實際輸出 luminance。
- extension 不驗證 DICOM conformance。
- extension 不能取代經校正的 medical display workflow。
- 它使用瀏覽器 SVG filters，因此輸出可能受 browser、GPU path、video pipeline 與頁面渲染方式影響。

在本專案中，GSDF 是一個讓影片預覽控制更有感知意義的 transfer model，不是認證邊界。
