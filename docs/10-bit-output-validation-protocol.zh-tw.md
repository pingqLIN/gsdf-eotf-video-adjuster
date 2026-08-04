# 10-bit 輸出驗證協議

> **目的：** 定義 renderer 宣稱端到端 10-bit GSDF/CSDF output 前所需的證據。單獨通過 model calculation、browser UI check、source-code inspection、螢幕規格或 Windows HDR toggle 都不足以成立。

English authoritative version: [10-bit-output-validation-protocol.md](10-bit-output-validation-protocol.md)。

## 適用範圍

本協議適用於提議中的高精度 renderer。現行 SVG component-transfer extension path 是 **預期不合格的 baseline**，但仍可作為 8-bit comparison route。

本協議不認證 DICOM conformance、diagnostic-display fitness 或任何特定使用者的 visual threshold；它只在已記錄的 hardware/software configuration 上驗證指定 rendering path。

## 被測試的聲明

通過後僅支持以下有限聲明：

> 在已記錄的 configuration 上，具名 renderer 保留高精度 GSDF/CSDF transfer path，沒有在 presentation 前出現 8-bit transfer-table bottleneck；它經過已驗證的 10-bit-or-higher output path，並對宣告的 test patterns 產生可重現的 physical measurements。

不得把結論泛化到其他 browser、GPU、driver、display、protected content、OS state 或 renderer mode；除非重做適用的 gates。

## 必要 test matrix

至少執行下列 matrix。任何 row 缺少必要 datum，或 tool 暗中替換 renderer，都視為無效。

| Axis | 必要值 |
| --- | --- |
| Renderer | 現行 SVG baseline；每個提議的 high-precision renderer |
| Source | 已知 8-bit ramp；已記錄 codec 與 metadata 的已知 10-bit、1024-step ramp |
| Transfer | GSDF 與 CSDF，並記錄 luminance/gamma/black/white settings |
| HDR state | Off 與 on（平台支援時） |
| Dither state | Renderer 提供時的 off 與 on |
| Capture | GPU/surface inspection，以及會宣告本身 bit depth 的 capture method；physical photometer measurement |
| Bands | 0–31、32–127、128–191、192–255 的 8-bit-equivalent code ranges；對 1024-step ramp 使用對應的 10-bit ranges |

保留每個 source pattern 的 raw、immutable copy。Test patterns 必須標示 dimensions、frame rate、codec、transfer characteristics、mastering data 與 nominal code values。不可把 screenshot 當作 10-bit pattern 的 source of truth。

## Evidence gates

若要宣稱 10-bit output，所有 gates 都必須通過。

### G0 — Configuration record

記錄以下內容，但不記錄 secret values：

- renderer build、commit、mode 與 settings export；
- browser/host executable version，必要時也記 command-line mode；
- OS build、HDR/AutoHDR state、GPU model、driver version、cable/output path、display model、selected refresh rate 與 display colour configuration；
- source pattern hash 與完整 media metadata；
- measurement instruments、firmware、calibration date、aperture、integration time、geometry、room lighting 與 capture-tool version。

**通過：** configuration 足以讓另一位 operator 重現測試環境。
**失敗：** format、driver、HDR、source 或 instrument 欄位有任何 UNKNOWN。

### G1 — Renderer-path proof

顯示選定 renderer 接收已宣告 source，並以 high-precision representation 執行 GSDF/CSDF transfer。可接受的證據是 source-level trace 加上 runtime capture 或 shader/pipeline inspection。必須指明 format 與 precision，不能只由 API 名稱推論。

**通過：** 正面識別 transfer stage，且 presentation 前沒有 8-bit LUT 或等效 quantising transfer stage。
**失敗：** transfer-stage format 不明，或路徑在 output 前通過 256-entry／8-bit table。

### G2 — Presentation-surface proof

以 RenderDoc、PIX、ETW、driver tool 或等效 instrumented trace 擷取實際 output/presentation surface。記錄 surface format、colour space、需要時的 HDR metadata，以及使用 composition 或 overlay。

**通過：** 證據識別 renderer 和受測 scenario 使用的 10-bit-or-higher presentation surface（或較高 precision surface，且另行識別最終 conversion）。
**失敗：** 只知道可能的 format、trace 不可用，或實際 path fallback 到 8-bit。

### G3 — Code-level retention

對已知 10-bit ramp，擷取能保留所宣稱 bit depth 的 lossless representation，或在 final panel 前檢查 renderer。分析已宣告 ramp range 的 plateaus 與 distinct code values。會 quantise 到 8-bit 的 capture pipeline 只能做 visual comparison，不能通過本 gate。

**通過：** 分析方法能分辨預期的 10-bit code steps，且沒有未解釋的 pre-presentation collapse 至 256 levels。
**失敗：** 分析看到 8-bit cap、無法保留必要 depth，或無法識別 plateaus 的來源。

### G4 — Physical display measurement

以 calibrated photometer 或等效 instrument，在每個必要 band 量測一系列 adjacent codes。至少記錄 repeated samples、mean、standard deviation 與 instrument resolution/noise floor。推導 DDL-to-nit 和所宣告 JND metric 時，不可悄悄以 source model 取代 missing measurements。

**通過：** measurements 在 instrument uncertainty 內可區分選定的 adjacent codes，並能在已宣告 runs 間重現。
**失敗：** observed differences 低於 instrument resolution、結果不能重現，或無法將 panel FRC/dithering 與聲明分開。

### G5 — Comparison and regression

在相同 source、settings、display state 與 measurement process 下，將 candidate 和 SVG baseline 比較。每次 renderer、browser/host、GPU-driver 或 display-mode 變更後，都要重跑 candidate gates。

**通過：** 報告清楚分開 candidate evidence、SVG-baseline evidence 與 UNKNOWN observations。
**失敗：** 以 baseline model result 當作 candidate runtime proof，或混用不同 configurations 的 results。

## Result record

每個 matrix row 使用一筆 record。raw trace/capture/measurement files 應放到專案核准的 evidence store；publishable documentation 不得包含 private display identifiers 或不相關 system data。

```text
Run ID:
Date / operator:
Renderer / commit / mode:
Source pattern / hash / codec / bit depth / metadata:
GSDF or CSDF settings:
OS / browser-or-host / GPU driver / display state:
Presentation evidence tool / surface format / colour space / HDR metadata:
Capture method / confirmed capture bit depth:
Photometer / calibration / geometry / repeats:
Band measurements and uncertainty:
G0: pass | fail | blocked
G1: pass | fail | blocked
G2: pass | fail | blocked
G3: pass | fail | blocked
G4: pass | fail | blocked
G5: pass | fail | blocked
Verdict:
Unknowns and deviations:
Raw-evidence locations:
```

`blocked` 不等於通過。只有每一個 gate 都是 `pass`，才可宣稱 10-bit-output；否則 renderer 對此聲明仍是 unverified。

## 現行 SVG baseline 的結果

架構參考文件指出，現行 SVG component-transfer route 在已查核 Chromium implementation 上會因設計而不通過 G1：presentation 前的 transfer table 已成為每 channel 256-entry `uint8_t` LUT。Baseline 仍可測試 compatibility、hard-8 optimisation 與 dither appearance，但不可當作端到端 10-bit GSDF/CSDF output 的正面證據。

## 相關資料

- [Rendering and bit-depth architecture reference](rendering-bit-depth-architecture.md)
- [Current GSDF model](gsdf-model.md)
- [Current bit-depth model report](gsdf-csdf-bit-depth-report.html)
