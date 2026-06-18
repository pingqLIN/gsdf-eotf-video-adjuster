# GSDF 應用與 UI 審查報告

日期：2026-06-02

## 範圍

本報告重新審查專案使用 GSDF 公式的合理性、可優化方向，以及 Chrome extension 控制面板的實際瀏覽器 UI 審查與改版結果。

審查來源：

- DICOM PS3.14 current HTML/PDF: https://dicom.nema.org/medical/dicom/current/output/html/part14.html
- DICOM PS3.14 GSDF 係數與 luminance model: https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_B.html
- 醫療顯示校正文獻中的 Barten model 脈絡：https://pmc.ncbi.nlm.nih.gov/articles/PMC3043865/
- 複雜背景下的 GSDF validation/caveat 脈絡：https://pmc.ncbi.nlm.nih.gov/articles/PMC3447097/
- 目前實作：[src/types.ts](../src/types.ts)、[extension/content.js](../extension/content.js)
- 目前模型說明：[docs/gsdf-model.ZHTW.md](gsdf-model.ZHTW.md)

## 公式審查

原始研究脈絡是 Barten-style human visual contrast sensitivity modeling；DICOM PS3.14 將它整理成 normative GSDF luminance/JND relationship。本專案實作的是 DICOM polynomial，不是原始心理物理實驗，也不是 clinical calibration workflow。

`gsdfJndToLuminance(jndIndex)` 的核心實作，是對 DICOM PS3.14 GSDF 插值公式的合理使用。`src/types.ts` 與 `extension/content.js` 的係數組符合 PS3.14 的 `log10(L(j))` 關係；目前測試除了標準端點範圍，也已補上中段 JND 與單調性樣本。

`luminanceToGsdfJnd(luminance)` 使用 binary search，而不是標準提供的近似 inverse polynomial。這對本專案是可接受的，因為 forward function 單調、transfer table 很小，而且以 forward equation 作為唯一真實來源，可以避免兩組 polynomial 係數彼此漂移。

## 應用合理性

本專案把 GSDF 當作 browser-video preview model，而不是 DICOM calibration system。只要文件持續明確說明限制，這個應用方向是合理的：

- extension 不量測實體螢幕 luminance、black level、環境光、或頁面/影片 pipeline 行為。
- SVG `feComponentTransfer` table 運作在瀏覽器 rendering space，只能近似校正後顯示反應。
- `pow(level, 1 / 2.2)` 是 extension-specific browser encoding approximation，不是 DICOM PS3.14 的要求。
- UI 應只提供一套完整 GSDF 路徑：先依所選 target luminance 產生完整 table，再用 filter 總量做全域混合。任何 target luminance 都不應再作為 neutral no-compensation point。
- 較高 filter 總量可能產生主觀清晰感。UI 與文件應將它標示為 preview/caveat，而不是校正分數或畫質提升。
- Barten/GSDF 假設最適合受控灰階觀看條件；複雜影像、scene adaptation、彩色影片與瀏覽器 rendering 都會削弱任何 conformance-style claim。

## 可優化方向

低風險建議：

- 保留目前 forward GSDF equation 作為 authoritative model。
- 增加 midrange JND luminance 與 monotonicity regression tests。
- 在模型流程旁明確標示 browser transfer approximation。
- 保留未來加入 configurable output transfer assumption 的空間，例如 exact sRGB OETF 或 display-gamma presets，但在沒有瀏覽器證據前不更動預設。

高風險方向，需要先量測：

- 依頁面偵測或選擇 SDR/HDR transfer assumption。
- 增加 display profile 或量測儀輔助校正輸入。
- 用完整 color-managed、display-profile-aware pipeline 取代目前瀏覽器 SVG approximation。這通常超出輕量 MV3 extension 能可靠控制的瀏覽器表面。

## UI 審查輸入

本輪使用三個 read-only reviewer：

- 公式 reviewer：沒有 blocking formula issue；建議補強 browser approximation 說明與 midrange/monotonic tests。
- UI/UX reviewer：basic tab 對 compact popup 來說承載太多檢查內容；文字層級偏淡；研究型 pattern 應維持 on-demand。
- 視覺/可及性 reviewer：disabled state 需要原生 `disabled` 語義；chart 不應固定在 `291x192`。

實際瀏覽器基準：

- 工具：Playwright
- URL：`http://127.0.0.1:3107/?mode=extension`
- Viewport：`1280x900`
- 基準證據保留於 `.clean/verification-screenshots/`
- 觀察結果：舊面板寬 380px、standby 狀態視覺過暗，model/status context 藏在 advanced tab。

## 已實作修正

- 將 extension panel 重設計為緊湊儀測控制面：更清楚的 active/standby 狀態、單一 GSDF 路徑、與日常操作路徑。
- 完全移除 target-luminance neutral anchoring；`strength` 現在是完整 GSDF table 之上的全域 filter 總量。
- 將 caveats 移到 hover tooltip，讓緊湊面板把空間保留給狀態、關鍵控制與視覺檢查。
- 移除純 GSDF UI 路徑，保留 filter 總量作為 user-facing adjustment。
- 將亮度校準條紋收合到 on-demand 控制；compact stripe preview 保持在面板範圍內，並保留完整多頻率 overlay。
- 為 segmented buttons 與 range sliders 加上原生 disabled semantics。
- 用 width-aware rendering 取代固定 chart 尺寸，並加入完整 chart overlay，讓曲線可以離開 compact extension panel 限制完整展示。
- 增加圖說，說明 axes、GSDF remap line 與 Standard sRGB reference。
- 移除遠端 Google Fonts dependency，改用適合 extension 的 local/system font stacks。
- 增加 GSDF 中段與單調性 regression coverage。
- 在模型文件補上 browser output step 屬於 DICOM PS3.14 外的近似。

## 修正後審查

修正後驗證已完成：

- `npm test`：23/23 passing。
- `npm run lint`：TypeScript check passed。
- `npm run build:ext`：Vite build passed，並已將 rebuilt assets 複製到 `extension/ui`。
- Playwright `?mode=extension` basic view on `http://127.0.0.1:3108`：panel rendered at `400x680px`，且可見 `STANDBY`、`GSDF`、filter 總量與顯示色域狀態。
- Playwright DOM check：沒有可見的 `Pure`、`純 GSDF`、`曲線模式`、target-luminance neutral-anchor text、caveat paragraph、手動儲存按鈕、body scrollbar、page scrollbar 或 panel overflow。
- Playwright tooltip check：full-GSDF 與 filter-amount explanations 已放在 hover `title` text。
- Playwright stripe check：compact rows measured `284x28px`，並保持在 fixed control panel 範圍內；較大的 inspection pattern 保留在 overlay。
- Playwright autosave check：初始載入 1.2 秒後 `localStorage` 仍未被誤寫；切換顯示色域後，1 秒 debounce 會寫入新設定，並顯示 autosave toast。
- Playwright advanced standby DOM：顯示色域 buttons 具備原生 `disabled` state。
- Playwright advanced active DOM：啟用後 disabled controls cleared，chart text 存在，chart surface rendered at `319x192`。
- Playwright full chart overlay DOM：完整圖表按鈕存在，overlay rendered，chart surface measured `1535x420`，且圖說文字可見。
- 最終 browser console：沒有 UI runtime errors，也沒有 Recharts sizing warnings；只剩 React DevTools development info message 與 local dev server 缺少 `favicon.ico` 的請求。

截圖證據保留於本機 `.clean/verification-screenshots/`。
