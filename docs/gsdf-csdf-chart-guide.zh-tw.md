# GSDF/CSDF 圖表與擴充功能使用對照

這份文件說明 LumaLift 的 GSDF/CSDF 圖表應該怎麼看，以及如何把圖表判讀對照到 Chrome 擴充功能控制面板。它是使用說明與判讀輔助，不是顯示器校正報告、DICOM 合規結果、colorimeter 量測結果或 CSDF verifier。

![曲線圖截圖，顯示 Standard sRGB 與目前 GSDF/CSDF remap 線](../assets/readme-curve-chart.png)

## 這份圖表在看什麼

GSDF/CSDF 圖表顯示目前設定產生的 `transfer table` 如何把輸入碼值映射成輸出值。橫軸是 `input pixel value`，範圍是 `0..255`；縱軸是 `normalized output`，範圍是 `0..1`。圖上的基準線用來對照一般輸入到輸出的關係，active remap 線則代表目前 GSDF 或 CSDF 路徑實際取樣出的轉換結果。

看圖時不要把曲線變化當成畫質分數。曲線只是幫你理解目前校正方向：暗部是否被抬起、中間調是否被重新分配、亮部是否被壓縮或拉伸。真正要判斷效果，仍要回到影片內容、輸出預覽條紋、校正條紋與完整參考圖樣一起看。

## 曲線圖各區塊意義

| 區塊 | 意義 | 判讀方式 |
|---|---|---|
| X 軸 `input pixel value` | 原始輸入碼值，從黑到白 | 越往右代表越亮的輸入 |
| Y 軸 `normalized output` | 經目前 table 或 levels 後的輸出 | 越高代表輸出越亮 |
| `Standard sRGB` 基準線 | 一般基準參考 | 用來對照 remap 是否偏離一般視覺反應 |
| `GSDF remap` / `CSDF remap` | 目前 active transfer table 的取樣曲線 | 跟著 `Lmax`, `Gamma compensation`, `Filter amount`, route 等設定改變 |
| 圖例 | 顯示目前曲線代表 GSDF 或 CSDF | 確認自己正在看的是哪條路徑 |
| `Include levels` | 把 Black/White point 後級 levels 也納入曲線 | 用來觀察額外裁切、拉伸後的輸出，不是 DICOM GSDF 公式本身 |

如果 active remap 線在暗部高於基準線，通常代表暗部被抬起，較容易看見陰影或霧中細節。如果曲線在高光區變平，可能代表亮部被壓縮，能保留部分高光層次，但也可能降低亮部對比。

## GSDF 與 CSDF 在擴充功能中的差異

`GSDF` 是灰階或亮度導向路徑。它可以把同一張 transfer table 直接套到 RGB channel，也可以走 YCbCr-style luma/chroma 管線，只對 Y channel 套用 GSDF，再轉回 RGB。這條路徑比較接近「亮度感知」的解釋方式。

`CSDF` 是目前預設的色彩路徑。它會把 active transfer table 直接套到 R/G/B channel，因此作用在 RGB cube 上，而不是先轉成 YCbCr 後只處理 luma。這能讓彩色影片與 CSDF 視覺線性圖樣用同一套 active table 對照。

`Display gamut` 在 GSDF YCbCr 路徑會影響 luma coefficients；在目前 CSDF RGB route 中，它不是一個獨立的 3D 色彩 LUT。換句話說，這裡的 CSDF 是瀏覽器可執行的近似色彩影片重映射，不是完整 display characterization 後的 CSDF calibration。

## 對照擴充功能的使用方式

![展開工作區截圖，顯示左側控制欄與中央 GSDF-QC/曲線工作區](../assets/readme-panel-expanded-workspace.png)

建議操作順序如下：

1. 開啟 `Enable`，讓擴充功能把 managed SVG/CSS filter chain 套到目標 HTML video。
2. 設定 `Lmax`。它決定建立 GSDF/CSDF transfer table 時採用的目標峰值亮度。這是目標值，不是量測值。
3. 只在需要時調整 `Gamma compensation`。中心值代表保留一般 gamma 觀看基準；往亮或往暗推，都是在 GSDF/CSDF 之前先修正輸入端偏差。
4. 用 `Filter amount` 控制強度。`0%` 會接近 gamma-adjusted baseline，`100%` 會套用完整 remap，中間值是兩者混合。
5. 選擇 `GSDF` 或 `CSDF` route。一般彩色影片可先用預設 CSDF 色彩路徑；若要觀察灰階或亮度導向行為，再切回 GSDF。
6. 只有在 GSDF route 下才需要判斷 `GSDF pipeline`。`RGB` 是各 channel 獨立套用；`YCbCr` 是以 luma/chroma 方式處理 Y channel。
7. 用 `Black/White point` 做後級 levels 調整。它能拉開或裁切輸出範圍，但不屬於 DICOM PS3.14 GSDF 公式。
8. 需要檢查漸層或 banding 時再啟用 `Dither Beta`。它會影響實際影片路徑與 CMY/RGB 連續漸層參考圖。

實務上，先用最低足夠強度恢復你需要的細節。若霧氣、暗部或陰影開始有層次，但畫面還不像被過度推亮，通常比追求最大曲線差異更可靠。

## 繪製區是否受調整影響

![會受調整影響與固定參考分區示意圖](assets/gsdf-csdf-affected-surfaces.svg)

擴充功能中的繪製區分成兩類。第一類會跟著目前設定變動，適合用來看「這組設定實際造成什麼視覺結果」。第二類保持固定參考，適合用來看「顯示器、縮放或觀看條件是否仍能分辨固定低對比差異」。

會受目前調整影響：

- 曲線圖中的 active remap 線。
- 輸出預覽條紋。
- CSDF 視覺線性圖樣。
- CMY/RGB 連續漸層圖樣，尤其啟用 `Dither Beta` 時。
- 實際 HTML video 上的 managed SVG/CSS filter chain。

不受目前 GSDF/CSDF table 影響或保持固定參考：

- 亮度校正條紋。
- 固定低對比 code-value pair。
- 用於檢查顯示縮放、browser zoom 或幾何狀態的固定參考邊界。

固定參考不是「沒有作用」。它的價值正是保持不動，避免所有檢查畫面都跟著設定一起移動。當輸出預覽看起來改善，但固定校正條紋仍然無法分辨時，問題可能不只在 transfer table，也可能在面板亮度、環境光、OS scaling、browser zoom 或影片本身。

## 判讀提醒與限制

LumaLift 是瀏覽器端觀看輔助工具。它不量測實體螢幕、環境光、HDR/SDR 實際輸出、GPU path 或頁面內部影片管線。標準 HTML video 是主要目標；DRM、Canvas/WebGL、跨來源 iframe、網站自訂濾鏡或強勢 CSS 都可能改變結果。

因此，圖表與參考圖應該用來幫助你做觀看決策，而不是用來宣稱醫療校正、DICOM conformance、完整 CSDF calibration 或顯示器 QA 完成。曲線看起來合理，只代表目前設定的方向可理解；實際可用性仍要以目視結果與穩定參考一起判斷。

## 相關文件

- [GSDF 模型說明](gsdf-model.ZHTW.md)
- [測試圖 route 說明](test-patterns.zh-tw.md)
- [專案 README](../README.zh-tw.md)
