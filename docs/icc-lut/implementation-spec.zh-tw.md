# LumaLift / GSDF-EOTF Video Adjuster：動態 GSDF/CSDF ICC 與 EIZO LUT CSV 開發規格

> 交付對象：coding agent / repo maintainer
> 目標 repo：`pingqLIN/gsdf-eotf-video-adjuster`
> 主要任務：對應 extension 目前設定，新增可動態產生 GSDF/CSDF 虛擬 ICC profile 與 EIZO ColorNavigator 可讀 Gamma LUT CSV 的功能。

---

## 0. 結論與不可變設計原則

1. **每一個 ICC / EIZO LUT 都是設定快照，不是動態容器。**
   `lmax`、`transferFormula`、`displayGamma`、`displayGamut`、`strength`、`blackPoint`、`whitePoint`、display preset、OLED toe 等任一參數改變，都必須重新產生檔案。

2. **不要只產生一種曲線。** 需要同時保留三種曲線語意：

   | 曲線名稱 | 符號 | 用途 | 說明 |
   |---|---:|---|---|
   | code remap | `M(c)` | extension SVG / CSS filter、外部 1D LUT processor | input code → output code |
   | target EOTF | `E(c)` | EIZO ColorNavigator Gamma LUT target、descriptive ICC | input code → normalized luminance |
   | ICC compensation TRC | `D(d)` | 安裝為系統 display ICC 時的補償 profile | device code → PCS linear value |

3. **EIZO Gamma LUT CSV 應輸出 `target EOTF`，不是 ICC compensation TRC。**
   ColorNavigator 的 Gamma Adjustment Target 是監視器要被校成的目標灰階曲線；因此輸入 0..255 應對應目標 luminance response。不要把 `D(d)=S(M^-1(d))` 塞給 EIZO。

4. **ICC 預設做 Matrix/TRC，不要 MVP 就做 3D LUT ICC。**
   MVP profile class：`mntr`、RGB → XYZ、D50 PCS、`rXYZ/gXYZ/bXYZ`、`rTRC/gTRC/bTRC`。LUT-based profile 可留作 experimental。

5. **不要混用 `.cal/vcgt` 與 display profile TRC。**
   `.cal` / `vcgt` 是 video-card calibration LUT；ICC 的 `rTRC/gTRC/bTRC` 是 display shaper / tone reproduction curve。這兩層用途不同。

---

## 1. 對齊現有 extension 設定

目前 repo 的共用設定模型在 `src/types.ts`，需要沿用以下欄位作為 profile / LUT 產生器輸入：

```ts
export interface AppSettings {
  enabled: boolean;
  lmax: number;                     // 10..500 nits
  curveMode: 'relative';
  gammaTarget: number;              // 1.0..3.0
  displayGamma: number;             // 1, 1.8, 2.2, 2.4, 2.6
  sourceIsLinear: boolean;
  transferFormula: 'gsdf' | 'csdf';
  gsdfPipeline: 'ycbcr' | 'rgb';
  displayGamut: 'srgb' | 'display-p3' | 'adobe-rgb';
  strength: number;                 // 0..100
  blackPoint: number;               // 0..16, input code clip / remap
  whitePoint: number;               // 240..256, input code clip / remap
  fineSharpness: number;
  mediumSharpness: number;
  temperature: number;
  saturation: number;
  grayscale: boolean;
  hue: number;
}
```

### 1.1 必須修正 / 強化的點

目前 `transferFormula: 'gsdf' | 'csdf'` 已經存在於 settings，但現有 `buildGsdfTableValues()` 必須確認真的依 `transferFormula` 分支產生不同曲線。若目前仍只有 GSDF-like path，請補上 CSDF path 並加 regression test：

```ts
assert.notDeepStrictEqual(
  buildToneCurveSnapshot({ ...settings, transferFormula: 'gsdf' }).codeRemap,
  buildToneCurveSnapshot({ ...settings, transferFormula: 'csdf' }).codeRemap,
);
```

---

## 2. 新增輸出模式

### 2.1 ICC 輸出

支援兩種 profile intent：

```ts
export type IccProfileIntent = 'compensation' | 'descriptive';
```

#### A. `compensation`：系統顯示器 ICC 預設

目標：讓色彩管理系統在標準來源空間轉到顯示器 profile 時，輸出接近 extension 目前的 code remap。

定義：

```text
S(c) = source color space TRC / source EOTF, normalized 0..1
M(c) = extension code remap, input code -> output code
D(d) = ICC display profile 宣告的 display TRC

CMM 輸出約為：displayCode = D^-1(S(sourceCode))
希望結果為：displayCode = M(sourceCode)
所以應宣告：D(d) = S(M^-1(d))
```

這是安裝為 OS display ICC 時較合理的模式。

#### B. `descriptive`：描述一台 GSDF/CSDF 虛擬顯示器

定義：

```text
D(d) = E(d)
```

其中 `E(d)` 是目標 normalized luminance response。這適合 soft proof / profile inspection，但安裝成系統 profile 時 CMM 可能反向補償，視覺效果不一定等同 extension。

---

### 2.2 EIZO ColorNavigator Gamma LUT CSV 輸出

輸出格式：

```text
- 副檔名 .csv
- 256 行
- 每行 1 個數字
- 無 header
- 無逗號
- 所有數字必須 > 0
- 第 256 個值必須是整份檔案最大值
```

建議輸出 normalized target luminance：

```text
line 1   = max(E(0), epsilon)
line 2   = max(E(1/255), epsilon)
...
line 256 = 1.0
```

預設 `epsilon = 1e-6`，避免 EIZO 拒收 0。若某些版本偏好較高底值，可提供 advanced option：

```ts
export interface EizoLutOptions {
  samples: 256;                // 固定 256
  minPositiveValue: number;    // default 1e-6
  precision: number;           // default 10 decimal places
  valueScale: 'normalized';    // MVP 只支援 normalized 0..1
}
```

檔名建議：

```text
LumaLift-CSDF_EIZO_DisplayP3_OLED_L160_B0.0005_S80.csv
LumaLift-GSDF_EIZO_sRGB_IPS1000_L100_B0.100_S100.csv
```

---

## 3. Display presets

新增：`src/color/displayPresets.ts`

```ts
export type DisplayPresetId = 'ips-1000' | 'black-ips-2000' | 'oled-zero-black' | 'custom';

export interface DisplayDevicePreset {
  id: DisplayPresetId;
  label: string;
  contrastRatio: number | 'infinite';
  blackFloorMode: 'contrast-or-floor' | 'zero-with-epsilon' | 'manual';
  blackFloorNits: number;
  mathBlackNits: number;
  minActiveCode8: number;
  toeLiftStrength: number; // 0..1
  avoidDeadZone: boolean;
}

export const DISPLAY_DEVICE_PRESETS: Record<Exclude<DisplayPresetId, 'custom'>, DisplayDevicePreset> = {
  'ips-1000': {
    id: 'ips-1000',
    label: 'IPS / 1000:1',
    contrastRatio: 1000,
    blackFloorMode: 'contrast-or-floor',
    blackFloorNits: 0.10,
    mathBlackNits: 0.10,
    minActiveCode8: 1,
    toeLiftStrength: 0.10,
    avoidDeadZone: false,
  },

  'black-ips-2000': {
    id: 'black-ips-2000',
    label: 'BLACK IPS / 2000:1',
    contrastRatio: 2000,
    blackFloorMode: 'contrast-or-floor',
    blackFloorNits: 0.05,
    mathBlackNits: 0.05,
    minActiveCode8: 1,
    toeLiftStrength: 0.16,
    avoidDeadZone: false,
  },

  'oled-zero-black': {
    id: 'oled-zero-black',
    label: 'OLED / zero black',
    contrastRatio: 'infinite',
    blackFloorMode: 'zero-with-epsilon',
    blackFloorNits: 0,
    mathBlackNits: 0.0005,
    minActiveCode8: 2,
    toeLiftStrength: 0.28,
    avoidDeadZone: true,
  },
};

export function resolveEffectiveBlackNits(lmax: number, preset: DisplayDevicePreset): number {
  if (preset.blackFloorMode === 'zero-with-epsilon') return preset.mathBlackNits;
  if (preset.contrastRatio === 'infinite') return preset.mathBlackNits;
  return Math.max(lmax / preset.contrastRatio, preset.blackFloorNits);
}
```

### 3.1 OLED 特別規則

OLED UI 可顯示 measured black = `0 nits`，但數學計算不得使用 `0`：

```ts
const effectiveBlack = Math.max(preset.mathBlackNits, 1e-6);
```

OLED 需要 near-black dead zone bypass：

```ts
export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export function applyOledToeBypass(
  inputNorm: number,
  outputNorm: number,
  minActiveCode8: number,
  strength: number,
): number {
  const end = Math.max(1, minActiveCode8 + 2) / 255;
  if (inputNorm <= 0) return 0;
  if (inputNorm >= end) return outputNorm;

  const t = smoothstep(inputNorm / end);
  const lifted = Math.max(outputNorm, (minActiveCode8 / 255) * strength * t);
  return Math.min(1, lifted);
}
```

---

## 4. Gamut presets / Matrix ICC colorants

新增：`src/color/gamutPresets.ts`

```ts
export type VirtualGamutId = 'srgb' | 'display-p3' | 'adobe-rgb';

export interface XyChromaticity { x: number; y: number }

export interface VirtualGamutPreset {
  id: VirtualGamutId;
  label: string;
  red: XyChromaticity;
  green: XyChromaticity;
  blue: XyChromaticity;
  white: XyChromaticity; // D65 for these presets
  sourceTrc: 'srgb' | 'gamma';
  gamma?: number;
}

export const VIRTUAL_GAMUT_PRESETS: Record<VirtualGamutId, VirtualGamutPreset> = {
  srgb: {
    id: 'srgb',
    label: 'sRGB',
    red: { x: 0.640, y: 0.330 },
    green: { x: 0.300, y: 0.600 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    sourceTrc: 'srgb',
  },
  'display-p3': {
    id: 'display-p3',
    label: 'Display P3',
    red: { x: 0.680, y: 0.320 },
    green: { x: 0.265, y: 0.690 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    sourceTrc: 'srgb',
  },
  'adobe-rgb': {
    id: 'adobe-rgb',
    label: 'Adobe RGB (1998)',
    red: { x: 0.640, y: 0.330 },
    green: { x: 0.210, y: 0.710 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    sourceTrc: 'gamma',
    gamma: 563 / 256,
  },
};
```

Matrix ICC 寫入 `rXYZ/gXYZ/bXYZ` 前，請從 D65 primaries 計算 RGB→XYZ matrix，再 Bradford adapt 到 ICC PCS D50。

---

## 5. 核心曲線模型

新增：`src/color/curveMath.ts`

```ts
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

export function srgbToLinear(x: number): number {
  const v = clamp01(x);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(x: number): number {
  const v = clamp01(x);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function gammaToLinear(x: number, gamma: number): number {
  return Math.pow(clamp01(x), Math.max(0.01, gamma));
}

export function linearToGamma(x: number, gamma: number): number {
  return Math.pow(clamp01(x), 1 / Math.max(0.01, gamma));
}

export function decodeSourceTrc(x: number, sourceTrc: 'srgb' | 'gamma', gamma = 2.2): number {
  return sourceTrc === 'srgb' ? srgbToLinear(x) : gammaToLinear(x, gamma);
}

export function encodeDisplayCode(linear: number, displayGamma: number): number {
  return linearToGamma(linear, displayGamma);
}

export function decodeDisplayCode(code: number, displayGamma: number): number {
  return gammaToLinear(code, displayGamma);
}

export function repairMonotonic(values: readonly number[], minStep = 0): number[] {
  if (values.length < 2) return values.map(clamp01);

  const out = values.map(clamp01);
  out[0] = Math.max(0, out[0]);

  for (let i = 1; i < out.length; i += 1) {
    out[i] = Math.max(out[i], out[i - 1] + minStep);
  }

  const last = out[out.length - 1];
  if (last <= 0) {
    return out.map((_, i) => i / (out.length - 1));
  }

  for (let i = 0; i < out.length; i += 1) out[i] = clamp01(out[i] / last);
  out[0] = 0;
  out[out.length - 1] = 1;
  return out;
}

export function sampleLinear(table: readonly number[], x: number): number {
  if (table.length === 0) return clamp01(x);
  if (table.length === 1) return clamp01(table[0]);

  const pos = clamp01(x) * (table.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(table.length - 1, lo + 1);
  const t = pos - lo;
  return table[lo] + (table[hi] - table[lo]) * t;
}

export function invertMonotonicTable(table: readonly number[], sampleCount: number): number[] {
  const clean = repairMonotonic(table);
  const out = new Array<number>(sampleCount);
  let j = 0;

  for (let i = 0; i < sampleCount; i += 1) {
    const y = i / Math.max(1, sampleCount - 1);

    while (j < clean.length - 2 && clean[j + 1] < y) j += 1;

    const y0 = clean[j];
    const y1 = clean[j + 1];
    const x0 = j / (clean.length - 1);
    const x1 = (j + 1) / (clean.length - 1);
    const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
    out[i] = clamp01(x0 + (x1 - x0) * t);
  }

  out[0] = 0;
  out[out.length - 1] = 1;
  return out;
}
```

---

## 6. GSDF / CSDF luminance target

新增：`src/color/perceptualLuminance.ts`

注意：DICOM GSDF 公式有效範圍約從 `0.05 cd/m²` 到 `4000 cd/m²`。OLED 黑位可低於 0.05，但 JND 公式仍應以 `0.05` 作為 lower bound，再由 OLED toe / min active code 處理 near-black。

```ts
const GSDF_DISPLAY_LMIN_NITS = 0.05;
const GSDF_JND_MIN = 1;
const GSDF_JND_MAX = 1023;

const GSDF_COEFFICIENTS = {
  a: -1.3011877,
  b: -2.5840191e-2,
  c: 8.0242636e-2,
  d: -1.0320229e-1,
  e: 1.3646699e-1,
  f: 2.8745620e-2,
  g: -2.5468404e-2,
  h: -3.1978977e-3,
  k: 1.2992634e-4,
  m: 1.3635334e-3,
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function gsdfJndToLuminance(jndIndex: number): number {
  const j = clampNumber(jndIndex, GSDF_JND_MIN, GSDF_JND_MAX);
  const lnJ = Math.log(j);
  const lnJ2 = lnJ * lnJ;
  const lnJ3 = lnJ2 * lnJ;
  const lnJ4 = lnJ3 * lnJ;
  const lnJ5 = lnJ4 * lnJ;

  const numerator =
    GSDF_COEFFICIENTS.a +
    GSDF_COEFFICIENTS.c * lnJ +
    GSDF_COEFFICIENTS.e * lnJ2 +
    GSDF_COEFFICIENTS.g * lnJ3 +
    GSDF_COEFFICIENTS.m * lnJ4;

  const denominator =
    1 +
    GSDF_COEFFICIENTS.b * lnJ +
    GSDF_COEFFICIENTS.d * lnJ2 +
    GSDF_COEFFICIENTS.f * lnJ3 +
    GSDF_COEFFICIENTS.h * lnJ4 +
    GSDF_COEFFICIENTS.k * lnJ5;

  return Math.pow(10, numerator / denominator);
}

export function luminanceToGsdfJnd(luminance: number): number {
  const target = clampNumber(luminance, GSDF_DISPLAY_LMIN_NITS, 4000);
  let low = GSDF_JND_MIN;
  let high = GSDF_JND_MAX;

  for (let i = 0; i < 28; i += 1) {
    const mid = (low + high) / 2;
    if (gsdfJndToLuminance(mid) < target) low = mid;
    else high = mid;
  }

  return (low + high) / 2;
}

export function gsdfTargetLuminanceNorm(
  codeNorm: number,
  blackNits: number,
  whiteNits: number,
): number {
  const minForJnd = Math.max(GSDF_DISPLAY_LMIN_NITS, blackNits);
  const maxForJnd = Math.max(minForJnd + 0.01, whiteNits);

  const jMin = luminanceToGsdfJnd(minForJnd);
  const jMax = luminanceToGsdfJnd(maxForJnd);
  const j = jMin + clamp01(codeNorm) * (jMax - jMin);
  const lum = gsdfJndToLuminance(j);

  return clamp01((lum - blackNits) / Math.max(0.000001, whiteNits - blackNits));
}

export function csdfTargetLuminanceNorm(
  codeNorm: number,
  blackNits: number,
  whiteNits: number,
  toeLiftStrength: number,
): number {
  // CSDF = contrast-aware GSDF variant for this project.
  // It uses display-specific black as anchor, then applies a mild shadow toe
  // to avoid near-black non-action regions while preserving monotonicity.
  const base = gsdfTargetLuminanceNorm(codeNorm, blackNits, whiteNits);
  const x = clamp01(codeNorm);
  const shadowZone = 0.08;
  const t = 1 - smoothstep(Math.min(1, x / shadowZone));
  const lift = toeLiftStrength * 0.02 * t * x;
  return clamp01(base + lift);
}
```

---

## 7. Curve snapshot：單一資料來源供 ICC、EIZO、UI 共用

新增：`src/color/buildToneCurveSnapshot.ts`

```ts
import type { AppSettings } from '../types';
import { normalizeAppSettings } from '../types';
import { VIRTUAL_GAMUT_PRESETS } from './gamutPresets';
import type { DisplayDevicePreset } from './displayPresets';
import { resolveEffectiveBlackNits } from './displayPresets';
import {
  clamp01,
  decodeSourceTrc,
  decodeDisplayCode,
  encodeDisplayCode,
  invertMonotonicTable,
  repairMonotonic,
} from './curveMath';
import { gsdfTargetLuminanceNorm, csdfTargetLuminanceNorm } from './perceptualLuminance';

export interface ToneCurveSnapshotOptions {
  tableSize: number;              // ICC: 8192; UI/EIZO: 256
  profileIntent: 'compensation' | 'descriptive';
  displayPreset: DisplayDevicePreset;
}

export interface ToneCurveSnapshot {
  settings: AppSettings;
  effectiveBlackNits: number;
  targetWhiteNits: number;
  inputNorm: number[];
  targetEotfNorm: number[];       // E(c), for EIZO / descriptive ICC
  codeRemapNorm: number[];        // M(c), for extension / external LUT processor
  inverseCodeRemapNorm: number[]; // M^-1(d)
  iccTrcNorm: number[];           // D(d), for rTRC/gTRC/bTRC
}

function applyInputClipControls(input: number, blackPoint8: number, whitePoint8: number): number {
  const black = clamp01(blackPoint8 / 255);
  const white = whitePoint8 >= 256 ? 1 : clamp01(whitePoint8 / 255);
  return clamp01((input - black) / Math.max(1e-6, white - black));
}

export function buildToneCurveSnapshot(
  rawSettings: Partial<AppSettings>,
  options: ToneCurveSnapshotOptions,
): ToneCurveSnapshot {
  const settings = normalizeAppSettings(rawSettings);
  const gamut = VIRTUAL_GAMUT_PRESETS[settings.displayGamut];
  const tableSize = Math.max(2, Math.round(options.tableSize));
  const effectiveBlackNits = resolveEffectiveBlackNits(settings.lmax, options.displayPreset);
  const targetWhiteNits = settings.lmax;
  const strengthMix = settings.strength / 100;

  const inputNorm = Array.from({ length: tableSize }, (_, i) => i / (tableSize - 1));

  const targetEotfRaw = inputNorm.map((input) => {
    const clipped = applyInputClipControls(input, settings.blackPoint, settings.whitePoint);
    const gammaAdjustedCode = Math.pow(clipped, settings.gammaTarget / settings.displayGamma);

    const perceptual = settings.transferFormula === 'csdf'
      ? csdfTargetLuminanceNorm(
          gammaAdjustedCode,
          effectiveBlackNits,
          targetWhiteNits,
          options.displayPreset.toeLiftStrength,
        )
      : gsdfTargetLuminanceNorm(gammaAdjustedCode, effectiveBlackNits, targetWhiteNits);

    const baselineLinear = decodeDisplayCode(gammaAdjustedCode, settings.displayGamma);
    return baselineLinear + (perceptual - baselineLinear) * strengthMix;
  });

  let targetEotfNorm = repairMonotonic(targetEotfRaw);

  if (options.displayPreset.avoidDeadZone) {
    targetEotfNorm = targetEotfNorm.map((v, i) => {
      const x = inputNorm[i];
      return applyOledToeBypass(x, v, options.displayPreset.minActiveCode8, options.displayPreset.toeLiftStrength);
    });
    targetEotfNorm = repairMonotonic(targetEotfNorm);
  }

  // M(c): convert target luminance to output display code for current display gamma.
  // This is what the extension/browser-side transfer table approximates.
  const codeRemapNorm = repairMonotonic(targetEotfNorm.map((linear) => encodeDisplayCode(linear, settings.displayGamma)));

  const inverseCodeRemapNorm = invertMonotonicTable(codeRemapNorm, tableSize);

  const iccTrcNorm = options.profileIntent === 'descriptive'
    ? targetEotfNorm
    : repairMonotonic(
        inverseCodeRemapNorm.map((srcCode) => decodeSourceTrc(srcCode, gamut.sourceTrc, gamut.gamma ?? 2.2)),
      );

  return {
    settings,
    effectiveBlackNits,
    targetWhiteNits,
    inputNorm,
    targetEotfNorm,
    codeRemapNorm,
    inverseCodeRemapNorm,
    iccTrcNorm,
  };
}
```

> 注意：`applyOledToeBypass`、`smoothstep` 可放在 `displayPresets.ts` 或 `curveMath.ts`，但應由同一模組匯出，避免 circular import。

---

## 8. EIZO LUT CSV exporter

新增：`src/eizo/exportEizoLutCsv.ts`

```ts
import type { ToneCurveSnapshot } from '../color/buildToneCurveSnapshot';

export interface EizoLutCsvOptions {
  minPositiveValue?: number;
  precision?: number;
}

export function buildEizoGammaLutCsv(
  snapshot: ToneCurveSnapshot,
  options: EizoLutCsvOptions = {},
): string {
  const minPositive = options.minPositiveValue ?? 1e-6;
  const precision = options.precision ?? 10;

  if (snapshot.targetEotfNorm.length !== 256) {
    throw new Error(`EIZO Gamma LUT CSV requires exactly 256 samples, got ${snapshot.targetEotfNorm.length}`);
  }

  const values = snapshot.targetEotfNorm.map((v) => Math.max(minPositive, Math.min(1, v)));

  // EIZO requires the 256th value to be highest.
  values[values.length - 1] = Math.max(1, ...values);

  for (let i = 1; i < values.length; i += 1) {
    values[i] = Math.max(values[i], values[i - 1] + minPositive * 0.1);
  }

  const max = values[values.length - 1];
  for (let i = 0; i < values.length; i += 1) values[i] = values[i] / max;
  values[0] = Math.max(minPositive, values[0]);
  values[values.length - 1] = 1;

  return `${values.map((v) => v.toFixed(precision)).join('\n')}\n`;
}
```

### 8.1 EIZO validation helper

```ts
export function validateEizoGammaLutCsv(csv: string): string[] {
  const lines = csv.trim().split(/\r?\n/);
  const errors: string[] = [];

  if (lines.length !== 256) errors.push(`Expected 256 lines, got ${lines.length}`);

  const values = lines.map((line, index) => {
    if (line.includes(',')) errors.push(`Line ${index + 1} must not contain comma`);
    const value = Number(line.trim());
    if (!Number.isFinite(value)) errors.push(`Line ${index + 1} is not finite number`);
    if (!(value > 0)) errors.push(`Line ${index + 1} must be > 0`);
    return value;
  });

  const last = values[255];
  const max = Math.max(...values);
  if (last !== max) errors.push('The 256th value must be the highest value in the record');

  for (let i = 1; i < values.length; i += 1) {
    if (values[i] < values[i - 1]) errors.push(`Curve is not monotonic at line ${i + 1}`);
  }

  return errors;
}
```

---

## 9. ICC Matrix/TRC writer

新增目錄：

```text
src/icc/
  binaryWriter.ts
  iccTypes.ts
  matrix.ts
  chromaticAdaptation.ts
  buildVirtualDisplayIcc.ts
  validateIcc.ts
```

### 9.1 ICC options

```ts
export interface IccGenerationOptions {
  profileVersion: 'v2';                 // MVP: v2 matrix/TRC; v4 later
  profileIntent: 'compensation' | 'descriptive';
  trcSampleCount: 4096 | 8192 | 16384;
  displayPreset: DisplayDevicePreset;
  includeVcgt?: false;                  // MVP fixed false
  description?: string;
}
```

### 9.2 ICC TRC input

```ts
const snapshot = buildToneCurveSnapshot(settings, {
  tableSize: options.trcSampleCount,
  profileIntent: options.profileIntent,
  displayPreset: options.displayPreset,
});

const trcU16 = snapshot.iccTrcNorm.map((v) => Math.round(clamp01(v) * 65535));
```

### 9.3 Binary writer requirements

ICC is big-endian. Implement minimal writer:

```ts
export class BinaryWriter {
  private bytes: number[] = [];

  get offset(): number { return this.bytes.length; }

  u8(v: number): void { this.bytes.push(v & 0xff); }
  u16(v: number): void { this.u8(v >> 8); this.u8(v); }
  u32(v: number): void { this.u8(v >> 24); this.u8(v >> 16); this.u8(v >> 8); this.u8(v); }
  i32(v: number): void { this.u32(v >>> 0); }

  ascii(s: string, len = s.length): void {
    for (let i = 0; i < len; i += 1) this.u8(i < s.length ? s.charCodeAt(i) : 0);
  }

  s15Fixed16(value: number): void {
    this.i32(Math.round(value * 65536));
  }

  pad4(): void {
    while (this.bytes.length % 4 !== 0) this.u8(0);
  }

  patchU32(offset: number, value: number): void {
    this.bytes[offset] = (value >> 24) & 0xff;
    this.bytes[offset + 1] = (value >> 16) & 0xff;
    this.bytes[offset + 2] = (value >> 8) & 0xff;
    this.bytes[offset + 3] = value & 0xff;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
```

### 9.4 Minimal tags

Required / recommended tags:

```text
'desc' textDescriptionType
'cprt' textType
'wtpt' XYZType, PCS D50 white
'rXYZ' XYZType
'gXYZ' XYZType
'bXYZ' XYZType
'rTRC' curveType
'gTRC' curveType
'bTRC' curveType
'chad' s15Fixed16ArrayType, optional but recommended when adapting D65 primaries to D50
```

MVP profile metadata:

```text
profile class = 'mntr'
color space   = 'RGB '
PCS           = 'XYZ '
platform      = 'MSFT' or zero
intent        = perceptual or relative colorimetric; default relative colorimetric is acceptable
illuminant    = D50 = 0.9642, 1.0000, 0.8249
creator       = 'LLFT'
```

### 9.5 Profile naming

```ts
export function buildProfileBaseName(snapshot: ToneCurveSnapshot, preset: DisplayDevicePreset): string {
  const s = snapshot.settings;
  const formula = s.transferFormula.toUpperCase();
  const gamut = s.displayGamut.replace('display-p3', 'DisplayP3').replace('adobe-rgb', 'AdobeRGB');
  const black = snapshot.effectiveBlackNits.toFixed(snapshot.effectiveBlackNits < 0.01 ? 4 : 3);
  return `LumaLift-${formula}_${gamut}_${preset.id}_L${s.lmax}_B${black}_G${s.displayGamma}_S${s.strength}`;
}
```

### 9.6 ICC validation criteria

- Header size equals actual bytes length.
- Tag table offsets are 4-byte aligned.
- `rTRC/gTRC/bTRC` sample count equals requested count.
- `rTRC/gTRC/bTRC` values are monotonic.
- `rXYZ/gXYZ/bXYZ` are D50-adapted, finite, non-zero.
- `desc` contains formula, gamut, display preset, lmax, black, display gamma, strength.

---

## 10. UI / extension integration

新增頁面：`src/components/IccProfilePage.tsx`

UI sections:

```text
[Current Extension Settings]
- transfer formula: GSDF / CSDF
- display gamut: sRGB / Display P3 / Adobe RGB
- target luminance
- display gamma
- gamma target
- strength
- black / white point

[Display Template]
- IPS 1000:1
- BLACK IPS 2000:1
- OLED zero black
- Custom

[Output Type]
- ICC compensation profile
- ICC descriptive profile
- EIZO ColorNavigator Gamma LUT CSV
- JSON sidecar metadata

[Preview]
- M(c) code remap
- E(c) target EOTF
- D(d) ICC TRC
- EIZO 256-sample line check

[Actions]
- Export ICC
- Export EIZO CSV
- Export JSON sidecar
- Install ICC to system: disabled until native helper exists
```

### 10.1 Blob download without extra permission

```ts
export function downloadBlob(bytes: Uint8Array | string, fileName: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

Chrome `downloads` permission is not required for this Blob method. Only use `chrome.downloads` if programmatic download management is needed.

### 10.2 Native install is optional and out-of-scope for MVP

System ICC installation requires a native helper, not plain browser JS. MVP should export files only; show a disabled button with explanation.

Future helper contract:

```ts
export interface NativeInstallRequest {
  type: 'installIccProfile';
  profileName: string;
  iccBase64: string;
  metadata: Record<string, unknown>;
  setAsDefault: boolean;
}
```

Extension side must call native messaging from service worker or extension page, not content script.

---

## 11. Storage / settings bridge

Current UI uses local state / localStorage. Refactor to central store:

```text
src/storage/settingsStore.ts
```

```ts
import type { AppSettings } from '../types';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../types';

const KEY = 'gsdf_extension_settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeAppSettings(raw ? JSON.parse(raw) : DEFAULT_APP_SETTINGS);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const normalized = normalizeAppSettings(settings);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  return normalized;
}
```

Later migration target: `chrome.storage.local`, because ICC generator page, extension UI, service worker and native helper bridge may all need the same settings.

---

## 12. Build / package changes

### 12.1 File additions

```text
src/color/
  curveMath.ts
  perceptualLuminance.ts
  displayPresets.ts
  gamutPresets.ts
  buildToneCurveSnapshot.ts

src/eizo/
  exportEizoLutCsv.ts

src/icc/
  binaryWriter.ts
  chromaticAdaptation.ts
  matrix.ts
  buildVirtualDisplayIcc.ts
  validateIcc.ts

src/components/
  IccProfilePage.tsx
  IccCurvePreview.tsx
  IccExportPanel.tsx

tests/
  curve-snapshot.test.mjs
  eizo-lut-csv.test.mjs
  icc-writer.test.mjs
  transfer-formula-branch.test.mjs
```

### 12.2 `package.json`

Keep existing scripts:

```json
{
  "scripts": {
    "dev": "vite --port=3101 --host=127.0.0.1 --strictPort",
    "test": "node --test tests/*.test.mjs",
    "build": "vite build",
    "build:ext": "vite build && node scripts/buildExt.js",
    "smoke:ext": "node scripts/smokeExtensionChrome.mjs",
    "lint": "tsc --noEmit"
  }
}
```

Add only if needed:

```json
{
  "scripts": {
    "test:icc": "node --test tests/*icc*.test.mjs tests/*lut*.test.mjs tests/*curve*.test.mjs"
  }
}
```

Avoid new runtime dependencies for ICC writing. A pure TypeScript binary writer is sufficient.

### 12.3 Extension build

`npm run build:ext` must continue to copy Vite output into `extension/ui`. If ICC page is routed by query string, no manifest change is required. If using options page, add:

```json
{
  "options_ui": {
    "page": "ui/index.html?mode=icc-profile",
    "open_in_tab": true
  }
}
```

---

## 13. Tests / acceptance criteria

### 13.1 Curve tests

```text
- buildToneCurveSnapshot(... tableSize 8192) returns all arrays length 8192
- codeRemapNorm, targetEotfNorm, iccTrcNorm are monotonic
- endpoints are approximately 0 and 1, except EIZO export first line must be > 0
- changing lmax changes curve
- changing displayPreset changes curve
- changing transferFormula from gsdf to csdf changes curve
- changing displayGamut changes source TRC / ICC matrix metadata
```

### 13.2 EIZO CSV tests

```text
- exactly 256 lines
- no header
- no comma
- all values finite and > 0
- line 256 is max
- monotonic non-decreasing
```

### 13.3 ICC tests

```text
- file begins with valid ICC header
- profile class is mntr
- color space is RGB
- PCS is XYZ
- includes rXYZ/gXYZ/bXYZ/rTRC/gTRC/bTRC/wtpt/desc/cprt
- tag offsets 4-byte aligned
- declared size equals byte length
- rTRC/gTRC/bTRC have requested sample count
- compensation ICC TRC differs from descriptive ICC TRC for non-identity curve
```

### 13.4 Repo integration tests

```text
npm run lint
npm test
npm run build
npm run build:ext
```

Smoke test remains optional unless Chrome is available:

```text
npm run smoke:ext
```

---

## 14. Sidecar JSON metadata

Every export should offer `.json` sidecar:

```json
{
  "generator": "LumaLift",
  "kind": "icc-profile | eizo-gamma-lut-csv",
  "profileIntent": "compensation | descriptive | eizo-target-eotf",
  "transferFormula": "csdf",
  "displayGamut": "display-p3",
  "displayPreset": "oled-zero-black",
  "targetLuminanceNits": 160,
  "effectiveBlackNits": 0.0005,
  "displayGamma": 2.2,
  "gammaTarget": 2.2,
  "strength": 80,
  "blackPoint": 0,
  "whitePoint": 256,
  "trcSampleCount": 8192,
  "eizoSamples": 256,
  "createdAt": "2026-06-28T00:00:00.000Z"
}
```

---

## 15. Important warnings shown in UI

```text
此 ICC / LUT 是目前設定的靜態快照。改變目標亮度、顯示器模板、黑位、gamma、gamut 或 strength 後，必須重新輸出。
```

```text
EIZO CSV 是 ColorNavigator Gamma Adjustment Target 用的 256-line gamma target，不是 3D LUT，也不是 ICC rTRC dump。
```

```text
ICC 安裝成系統 display profile 後，只會影響使用系統色彩管理的應用。瀏覽器影片、DRM、HDR overlay、GPU video path 或未色彩管理內容可能不套用。
```

```text
本功能不是顯示器量測、醫療校正或 DICOM conformance。精準校正仍需實際量測螢幕 luminance / EOTF。
```

---

## 16. Agent implementation plan

### Phase 1 — Curve core

1. Create `src/color/*` modules.
2. Move or wrap existing `gsdfJndToLuminance`, `luminanceToGsdfJnd`, `buildGsdfTableValues` logic.
3. Add `buildToneCurveSnapshot` returning `M(c)`, `E(c)`, `D(d)`.
4. Confirm `transferFormula` actually branches.
5. Add curve unit tests.

### Phase 2 — EIZO LUT CSV

1. Add `src/eizo/exportEizoLutCsv.ts`.
2. Add validation helper.
3. Add UI export button.
4. Add tests with sample output.

### Phase 3 — ICC Matrix/TRC

1. Add ICC binary writer.
2. Add RGB primaries → XYZ matrix.
3. Add Bradford D65 → D50 adaptation.
4. Add `curveType` tags from `snapshot.iccTrcNorm`.
5. Add `.icc` download and sidecar JSON.
6. Validate with tests and, if available, external ICC tools.

### Phase 4 — UI page

1. Add `IccProfilePage` route / mode.
2. Add display preset selector.
3. Add curve preview.
4. Add export buttons.
5. Add warnings.

### Phase 5 — Optional native helper

1. Add `nativeMessaging` permission only when implementing helper.
2. Add service worker bridge.
3. Implement OS-specific ICC installation outside extension JS.
4. Require explicit user confirmation before setting profile as default.

---

## 17. Definition of done

- `npm run lint` passes.
- `npm test` passes.
- `npm run build:ext` passes.
- Extension can export:
  - GSDF ICC compensation profile
  - CSDF ICC compensation profile
  - GSDF descriptive ICC profile
  - CSDF descriptive ICC profile
  - EIZO ColorNavigator Gamma LUT CSV
  - sidecar JSON
- EIZO CSV has exactly 256 numeric lines, all `> 0`, no header, no commas, last line highest.
- ICC profile names include formula, gamut, preset, target luminance, effective black, display gamma and strength.
- Changing `lmax` visibly changes ICC TRC and EIZO CSV.
- Changing display preset visibly changes CSDF curve.
- OLED preset never uses mathematical black = 0.
- `.cal` / `vcgt` data is never used as `rTRC/gTRC/bTRC`.
