# Virtual ICC curve CSV 正確欄位格式

本資料夾內的 CSV 採用 normalized Matrix/TRC profile 產生器格式。

## 1. ICC TRC CSV：`*_icc_trc_*.csv`

欄位：

```csv
index,input_norm,input_code_8bit,rTRC_norm,gTRC_norm,bTRC_norm,rTRC_u16,gTRC_u16,bTRC_u16
```

說明：

- `input_norm`：ICC curveType 的輸入 domain，固定 0..1，必須遞增。
- `rTRC_norm/gTRC_norm/bTRC_norm`：channel response curve，0..1，必須單調 non-decreasing。
- `*_u16`：直接可寫入 ICC `curv` tag 的 16-bit table value。
- 若是中性灰階 virtual ICC，可讓 RGB 三通道相同；若要保留實測 DisplayCAL profile，可使用三通道各自的 TRC。

## 2. Calibration / vcgt CSV：`*_cal_vcgt_256.csv`

欄位：

```csv
index,input_norm,input_code_8bit,vcgt_r_norm,vcgt_g_norm,vcgt_b_norm,vcgt_r_u16,vcgt_g_u16,vcgt_b_u16
```

說明：

- 這是 GPU / video LUT calibration curve，不是 ICC display rTRC/gTRC/bTRC。
- 若要做 profile 的 `vcgt` tag 或 debug DisplayCAL `.cal`，用這個表。
- 若要做 ICC Matrix/TRC 的 display shaper，通常用 `*_icc_trc_*.csv`。

## 3. Neutral measurement CSV：`*_neutral_measurements.csv`

欄位包含原始 RGB% 與 XYZ，並額外計算：

- `Y_abs_norm = Y / Ywhite`
- `Y_black_relative_norm = (Y - Yblack) / (Ywhite - Yblack)`

## 4. 用於「製作虛擬 ICC 曲線」的最小輸入

如果要從 extension/CSDF 曲線輸出建立 compensation ICC，建議先整理成：

```csv
index,input_norm,remap_output_norm
```

再由轉換器產生：

```csv
index,input_norm,remap_output_norm,inverse_source_norm,icc_trc_norm,icc_trc_u16
```

其中 compensation ICC 的 TRC 應是：

```text
D(d) = S(M^-1(d))
```

- `M(c)`：extension 目前的 output-code remap。
- `M^-1(d)`：反解後的來源 code。
- `S(x)`：來源標準 TRC，例如 sRGB linearization 或 gamma 2.2。

不要把 `remap_output_norm` 直接塞進系統顯示器 ICC 的 TRC，否則 CMM 會用反向補償，結果通常不等於 extension 的視覺輸出。
