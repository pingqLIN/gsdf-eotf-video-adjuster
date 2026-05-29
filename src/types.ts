export interface AppSettings {
  enabled: boolean;
  lmax: number;
  curveMode: GsdfCurveMode;
  colorModel: GsdfColorModel;
  strength: number;
  blackPoint: number;
  whitePoint: number;
  sharpness: number;
  temperature: number;
}

export type GsdfCurveMode = 'relative' | 'pure';
export type GsdfColorModel = 'rgb' | 'ycbcr';

export const LUMINANCE_MIN_NITS = 10;
export const LUMINANCE_MAX_NITS = 500;
export const LUMINANCE_SLIDER_MAX = 1000;
const LUMINANCE_LOG_RANGE = Math.log(LUMINANCE_MAX_NITS / LUMINANCE_MIN_NITS);
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

export const DEFAULT_APP_SETTINGS: AppSettings = {
  enabled: false,
  lmax: 500,
  curveMode: 'relative',
  colorModel: 'rgb',
  strength: 80,
  blackPoint: 0,
  whitePoint: 100,
  sharpness: 0,
  temperature: 0,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function roundLuminance(value: number): number {
  return Number(value.toFixed(value < 100 ? 1 : 0));
}

function normalizeCurveMode(value: unknown): GsdfCurveMode {
  return value === 'pure' ? 'pure' : DEFAULT_APP_SETTINGS.curveMode;
}

function normalizeColorModel(value: unknown): GsdfColorModel {
  return value === 'ycbcr' ? 'ycbcr' : DEFAULT_APP_SETTINGS.colorModel;
}

export function clampLuminance(value: unknown): number {
  return roundLuminance(clampNumber(value, LUMINANCE_MIN_NITS, LUMINANCE_MAX_NITS, DEFAULT_APP_SETTINGS.lmax));
}

export function sliderValueToLuminance(value: unknown): number {
  const sliderValue = clampNumber(value, 0, LUMINANCE_SLIDER_MAX, LUMINANCE_SLIDER_MAX);
  const ratio = sliderValue / LUMINANCE_SLIDER_MAX;

  return roundLuminance(LUMINANCE_MIN_NITS * Math.exp(LUMINANCE_LOG_RANGE * ratio));
}

export function luminanceToSliderValue(value: unknown): number {
  const luminance = clampLuminance(value);
  const ratio = Math.log(luminance / LUMINANCE_MIN_NITS) / LUMINANCE_LOG_RANGE;

  return Math.round(clampNumber(ratio, 0, 1, 1) * LUMINANCE_SLIDER_MAX);
}

export function getLowLuminanceRatio(value: unknown): number {
  const luminance = clampLuminance(value);

  return clampNumber(Math.log(LUMINANCE_MAX_NITS / luminance) / LUMINANCE_LOG_RANGE, 0, 1, 0);
}

export function gsdfJndToLuminance(jndIndex: number): number {
  const j = clampNumber(jndIndex, GSDF_JND_MIN, GSDF_JND_MAX, GSDF_JND_MIN);
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
  const target = clampNumber(luminance, GSDF_DISPLAY_LMIN_NITS, 4000, GSDF_DISPLAY_LMIN_NITS);
  let low = GSDF_JND_MIN;
  let high = GSDF_JND_MAX;

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const mid = (low + high) / 2;
    if (gsdfJndToLuminance(mid) < target) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

export function getGsdfDisplayCode(inputLevel: number, lmax: number): number {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const maxLuminance = clampLuminance(lmax);
  const minLuminance = Math.min(GSDF_DISPLAY_LMIN_NITS, maxLuminance * 0.01);
  const jndMin = luminanceToGsdfJnd(minLuminance);
  const jndMax = luminanceToGsdfJnd(maxLuminance);
  const jnd = jndMin + normalized * (jndMax - jndMin);
  const luminance = gsdfJndToLuminance(jnd);
  const linearDisplayLevel = clampNumber(
    (luminance - minLuminance) / Math.max(0.0001, maxLuminance - minLuminance),
    0,
    1,
    normalized,
  );

  return clampNumber(Math.pow(linearDisplayLevel, 1 / 2.2), 0, 1, normalized);
}

export function buildGsdfTableValues(settings: Partial<AppSettings>, tableSize = 256): number[] {
  const normalized = normalizeAppSettings(settings);
  const correctionRatio =
    normalized.curveMode === 'pure'
      ? 1
      : (normalized.strength / 100) * getLowLuminanceRatio(normalized.lmax);

  return Array.from({ length: tableSize }, (_, index) => {
    const inputLevel = index / Math.max(1, tableSize - 1);
    const gsdfLevel = getGsdfDisplayCode(inputLevel, normalized.lmax);
    const mixedLevel = inputLevel + (gsdfLevel - inputLevel) * correctionRatio;

    return Number(clampNumber(mixedLevel, 0, 1, inputLevel).toFixed(5));
  });
}

export interface GSDFStripeRow {
  id: string;
  label: string;
  left: number;
  right: number;
}

const GSDF_STRIPE_BASE_ROWS = [
  { id: 'dark', label: 'LOW', ratio: 0.08, deltaJnd: 6 },
  { id: 'shadow', label: 'DARK', ratio: 0.22, deltaJnd: 5 },
  { id: 'mid', label: 'MID', ratio: 0.48, deltaJnd: 4 },
  { id: 'bright', label: 'HIGH', ratio: 0.74, deltaJnd: 3 },
];

function sampleTableValue(table: number[], ratio: number): number {
  if (table.length === 0) {
    return clampNumber(ratio, 0, 1, 0);
  }

  const position = clampNumber(ratio, 0, 1, 0) * (table.length - 1);
  const lowIndex = Math.floor(position);
  const highIndex = Math.ceil(position);
  const mix = position - lowIndex;
  const lowValue = table[lowIndex] ?? ratio;
  const highValue = table[highIndex] ?? lowValue;

  return lowValue + (highValue - lowValue) * mix;
}

export function buildGsdfStripeRows(settings: Partial<AppSettings>): GSDFStripeRow[] {
  const normalized = normalizeAppSettings(settings);
  const maxLuminance = normalized.lmax;
  const minLuminance = Math.min(GSDF_DISPLAY_LMIN_NITS, maxLuminance * 0.01);
  const jndMin = luminanceToGsdfJnd(minLuminance);
  const jndMax = luminanceToGsdfJnd(maxLuminance);
  const jndRange = jndMax - jndMin;
  const transferTable = buildGsdfTableValues(normalized);

  return GSDF_STRIPE_BASE_ROWS.map((row) => {
    const baseRatio = clampNumber(row.ratio, 0, 1, 0);
    const nextRatio = clampNumber(baseRatio + row.deltaJnd / Math.max(1, jndRange), 0, 1, baseRatio);

    return {
      id: row.id,
      label: row.label,
      left: Math.round(sampleTableValue(transferTable, baseRatio) * 255),
      right: Math.round(sampleTableValue(transferTable, nextRatio) * 255),
    };
  });
}

export function buildGsdfCalibrationStripeRows(): GSDFStripeRow[] {
  return GSDF_STRIPE_BASE_ROWS.map((row) => {
    const left = Math.round(clampNumber(row.ratio, 0, 1, 0) * 255);
    const right = Math.min(255, left + 2);

    return {
      id: `cal-${row.id}`,
      label: row.label,
      left,
      right,
    };
  });
}

export function formatLuminance(value: number): string {
  return value < 100 ? value.toFixed(1) : String(Math.round(value));
}

export function normalizeAppSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const settings = value ?? {};
  const normalized: AppSettings = {
    enabled: settings.enabled === true,
    lmax: clampLuminance(settings.lmax),
    curveMode: normalizeCurveMode(settings.curveMode),
    colorModel: normalizeColorModel(settings.colorModel),
    strength: clampNumber(settings.strength, 0, 100, DEFAULT_APP_SETTINGS.strength),
    blackPoint: clampNumber(settings.blackPoint, 0, 20, DEFAULT_APP_SETTINGS.blackPoint),
    whitePoint: clampNumber(settings.whitePoint, 80, 100, DEFAULT_APP_SETTINGS.whitePoint),
    sharpness: clampNumber(settings.sharpness, 0, 100, DEFAULT_APP_SETTINGS.sharpness),
    temperature: clampNumber(settings.temperature, -50, 50, DEFAULT_APP_SETTINGS.temperature),
  };

  if (normalized.whitePoint <= normalized.blackPoint + 10) {
    normalized.whitePoint = Math.min(100, normalized.blackPoint + 10);
  }

  return normalized;
}
