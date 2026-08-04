# 渲染與位深架構參考

> **狀態：技術參考，不是輸出認證。** 本文件描述已查核的原始碼路徑與證據邊界；它不證明任何特定電腦、顯示器、驅動程式、瀏覽器版本或受保護影片路徑會輸出 10-bit。

English authoritative version: [rendering-bit-depth-architecture.md](rendering-bit-depth-architecture.md)。

## 範圍與術語

「10-bit」經常同時指涉三件不同的事，必須分開判讀：

| 性質 | 回答的問題 | 目前證據 |
| --- | --- | --- |
| 來源與解碼精度 | 媒體來源或 decode surface 是否為 10-bit？ | 不由本 extension 控制。 |
| 階調 renderer 精度 | GSDF/CSDF transfer 是否可保留超過 256 個可獨立控制的階數？ | 目前 Chromium SVG component-transfer 路徑不可以。 |
| 呈現精度 | 最終 OS／display path 是否至少以 10-bit 呈現？ | 依硬體與 runtime 而定，此處尚未驗證。 |

本文件所稱的 **effective 8-bit component-transfer** 僅描述第二項，並不表示所有上游或下游 surface 都是 8-bit。

## 已查核的目前路徑

```text
HTMLVideoElement
  -> CSS filter: url(#gsdf-eotf-...)
  -> Blink SVG filter / Skia table colour filter
  -> Chromium compositor / Viz / GPU process
  -> 作業系統 compositor
  -> display
```

Extension 只擁有第一段轉換：建立 SVG filters，並把 managed CSS filter chain 指派給目標 `HTMLVideoElement`。

| 已查核的實作事實 | 證據 |
| --- | --- |
| managed chain 將選定的 GSDF 或 CSDF transfer filter 放在 levels、temperature、colour 和選用 dither 之前。 | [`extension/content.js`](../extension/content.js) 的 `buildManagedFilterChain()` |
| GSDF RGB 與 CSDF 路徑使用 SVG `<feComponentTransfer>` 的 `table`；GSDF YCbCr 路徑則將 table 套到轉換後的 luma component。 | [`extension/content.js`](../extension/content.js) 的 `injectSVGFilter()` |
| Extension 建立 256-sample active transfer table。 | [`extension/content.js`](../extension/content.js) 的 `GSDF_TABLE_SIZE = 256` 與 `buildActiveTransferTableValues()` |
| Filter 以 `video.style.filter` 套用；extension 沒有自建 WebGL、WebGPU、WebCodecs、Worker 或 OffscreenCanvas video renderer。 | [`extension/content.js`](../extension/content.js) 的 `applyVideoFilter()` 與 source-tree inspection |
| 既有回歸測試檢查 managed-filter 的選擇與順序。 | [`tests/content-effects.test.mjs`](../tests/content-effects.test.mjs) |

`will-change: filter` 只是 compositing hint，不能選定固定 GPU backend、direct overlay、swap-chain format 或 display bit depth。

## Component-transfer 的瓶頸

專案將 256 個浮點 table values 交給 SVG。在本專案查核的 Chromium snapshot（`ad8089d25cba75a1719cec2af9063383edce811c`）中，Blink 的 `FEComponentTransfer` 會把 table 插值為每 channel 的 `uint8_t[256]` arrays，再建立 Skia `MakeTableARGB` colour filter。

- [查核的 Chromium snapshot：float table conversion](https://github.com/chromium/chromium/blob/ad8089d25cba75a1719cec2af9063383edce811c/third_party/blink/renderer/platform/graphics/filters/fe_component_transfer.cc#L43-L61)
- [256-entry `uint8_t` tables 與 `MakeTableARGB`](https://github.com/chromium/chromium/blob/ad8089d25cba75a1719cec2af9063383edce811c/third_party/blink/renderer/platform/graphics/filters/fe_component_transfer.cc#L134-L146)

對此目前專案路徑和已查核 Chromium revision 而言，這是第一個已知將 component-transfer 階數合併為 8-bit precision 的 stage。後段即使使用 P010 decode surface、Windows HDR、RGB10A2 swap chain、panel FRC 或 10-bit display，也無法還原在此之前已合併的階數。

這個結論有版本邊界；新的 Chromium 版本若有實作變更，必須重新查核。

## 目前 bit-depth report 的正確解讀

[`gsdf-csdf-bit-depth-report.html`](gsdf-csdf-bit-depth-report.html) 比較模型的 ideal floating-point curve 與 nearest-code 8-bit／10-bit quantisation。它能說明高精度 transfer model 的價值：

- hard 8-bit GSDF：225 個 unique output levels、31 個相鄰 transition 合併；
- hard 8-bit CSDF：227 個 unique output levels、29 個相鄰 transition 合併；
- 模擬 hard 10-bit：報告中的模型案例保留全部 256 個輸入樣本的不同值。

這些數字是 **model results**，不是 browser output 的量測；不能證明 extension 寫入了 10-bit surface。hard-8 JND optimizer 也是重新分配 8-bit device codes，最後仍回到同一條 256-entry SVG transfer-table 路徑，並非 10-bit renderer。

選用的 Dither Beta filter 以固定 seed SVG `feTurbulence` 產生 spatial noise。它可能改變 banding 的可見度，但尚未驗證為 temporal dithering，也無法恢復可獨立控制的 transfer levels。

## 決策邊界

目前 extension 應描述為高相容性的 effective-8-bit component-transfer viewing aid。不能只依來源 metadata、螢幕規格、Windows HDR 狀態、10-bit swap-chain 的可能性或數學 bit-depth report，就宣稱它是端到端 10-bit GSDF/CSDF renderer。

下列均是獨立、尚未實作的研究方向，不代表已選定架構：

| 方向 | 潛在效益 | 重要邊界 |
| --- | --- | --- |
| 維持 SVG component transfer | 保留 extension 現有相容性模型。 | 保留已查核的 8-bit component-transfer bottleneck。 |
| WebGL2 或 WebGPU shader | 可保留高精度 intermediate arithmetic。 | browser canvas/output precision、protected playback 與 page integration 仍須驗證。 |
| WebGPU 加 WebCodecs renderer | 可更直接控制 decode/frame processing。 | CORS、DRM、字幕、控制項與 website-player compatibility 必須重建或明確排除。 |
| 原生 D3D11/D3D12 renderer | 可明確管理 P010/FP16、RGB10A2、HDR metadata 與 presentation。 | 是獨立產品/runtime，另有 security、playback 與 validation 範圍。 |

本參考文件不授權更換 renderer。任何宣稱真正 10-bit output 的候選實作，都必須通過 [10-bit-output-validation-protocol.md](10-bit-output-validation-protocol.md) 的 evidence gates。

## 證據狀態

### VERIFIED

- Extension 對 `HTMLVideoElement` 套用 managed CSS/SVG filter chain，且使用 256-entry transfer tables。
- 已查核的 Chromium source snapshot 會把 component-transfer table 轉為每 channel 的 256-entry `uint8_t` LUT，再建立 Skia table filter。
- 目前專案 source 沒有 custom GPU/video-frame renderer。

### INFERRED

- 固定 spatial noise 可以降低部分 banding 的主觀可見度；結果依 content、scaling、composition 與 display 而變。
- CSS/SVG filter 通常需要 page composition/filter pass，實際 overlay eligibility 仍由 Chromium runtime 決定。

### UNKNOWN

- 目標機器的 active Chrome/GPU raster backend 與 feature status。
- SVG filter 前後的 decode 與 intermediate-surface formats。
- Windows HDR/AutoHDR、GPU-driver presentation format、OS colour management、compositor dithering、panel native depth 與 panel FRC。
- DRM/protected video 或指定網站 player pipeline 的行為。
- 特定 display 的 physical DDL-to-nit response 與 JND spacing。

## 相關資料

- [GSDF 模型與目前 browser approximation](gsdf-model.md)
- [GSDF/CSDF bit-depth model report](gsdf-csdf-bit-depth-report.html)
- [10-bit output validation protocol](10-bit-output-validation-protocol.md)
