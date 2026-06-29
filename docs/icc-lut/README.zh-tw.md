# ICC 與 EIZO LUT 歸檔

此資料夾收納兩條衍生線的設計輸入：

- `dynamic-icc-profile`：依瀏覽器擴充功能設定產生靜態 Matrix/TRC ICC profile snapshot。
- `eizo-cg-1d-lut`：產生 EIZO ColorNavigator 可讀的一維 Gamma/EOTF LUT CSV，供 CG 系列顯示器使用。

## 檔案

| 路徑 | 角色 |
|---|---|
| `implementation-spec.zh-tw.md` | 動態 ICC 與 EIZO LUT 產生器的繁體中文詳細實作規格。 |
| `virtual-icc-csv-schema.zh-tw.md` | virtual ICC TRC、vcgt/calibration、neutral measurements、compensation curve input 的 CSV schema。 |
| `templates/virtual-icc-curve-minimal-template.csv` | 將 extension remap curve 轉成 ICC-ready curve data 的最小輸入範本。 |
| `../../tools/icc-lut/convert_raw_curve_to_virtual_icc_csv.py` | 將原始 extension remap curve 轉為 compensation 或 descriptive ICC TRC CSV。 |
| `../../tools/icc-lut/convert_icc_curve_csv.py` | 將 DisplayCAL/Argyll ICC、CAL、TI3 曲線資料解析為 normalized CSV。 |

重複的 agent package zip 已保留在本機 `.clean/icc-lut-agent-package/`，不納入版本控制；可 diff 的來源文字檔已在上表列出。

## 曲線邊界

- `M(c)` 是瀏覽器擴充功能的 code remap。
- `E(c)` 是 target EOTF curve。
- `D(d)` 是 ICC compensation 或 descriptive TRC。
- EIZO Gamma/EOTF CSV 應輸出 target EOTF：256 行數字、無 header、無逗號、單調遞增或不遞減，且最後一列為最大值。

這些輸出都是目前設定的靜態 snapshot。只要亮度、黑位、display gamma、gamut、transfer formula 或 filter strength 改變，就必須重新產生檔案。
