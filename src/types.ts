export interface AppSettings {
  enabled: boolean;
  lmax: number;
  inputGamma: number;
  strength: number;
  blackPoint: number;
  whitePoint: number;
  sharpness: number;
  temperature: number;
}

export const LUMINANCE_MIN_NITS = 10;
export const LUMINANCE_MAX_NITS = 500;
export const LUMINANCE_SLIDER_MAX = 1000;
export const INPUT_GAMMA_MIN = 1;
export const INPUT_GAMMA_MAX = 2.6;
export const INPUT_GAMMA_DEFAULT = 1;
export const GSDF_OUTPUT_GAMMA = 2.2;
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
  inputGamma: INPUT_GAMMA_DEFAULT,
  strength: 80,
  blackPoint: 2,
  whitePoint: 98,
  sharpness: 20,
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

export function clampLuminance(value: unknown): number {
  return roundLuminance(clampNumber(value, LUMINANCE_MIN_NITS, LUMINANCE_MAX_NITS, DEFAULT_APP_SETTINGS.lmax));
}

export function clampInputGamma(value: unknown): number {
  return Number(clampNumber(value, INPUT_GAMMA_MIN, INPUT_GAMMA_MAX, DEFAULT_APP_SETTINGS.inputGamma).toFixed(2));
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

export function getGsdfDisplayCode(inputLevel: number, lmax: number, inputGamma = INPUT_GAMMA_DEFAULT): number {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const gamma = clampInputGamma(inputGamma);
  const sourceLinearLevel = Math.pow(normalized, gamma);
  const maxLuminance = clampLuminance(lmax);
  const minLuminance = Math.min(GSDF_DISPLAY_LMIN_NITS, maxLuminance * 0.01);
  const jndMin = luminanceToGsdfJnd(minLuminance);
  const jndMax = luminanceToGsdfJnd(maxLuminance);
  const jnd = jndMin + sourceLinearLevel * (jndMax - jndMin);
  const luminance = gsdfJndToLuminance(jnd);
  const linearDisplayLevel = clampNumber(
    (luminance - minLuminance) / Math.max(0.0001, maxLuminance - minLuminance),
    0,
    1,
    normalized,
  );

  return clampNumber(Math.pow(linearDisplayLevel, 1 / GSDF_OUTPUT_GAMMA), 0, 1, normalized);
}

export function buildGsdfTableValues(settings: Partial<AppSettings>, tableSize = 256): number[] {
  const normalized = normalizeAppSettings(settings);
  const strengthRatio = normalized.strength / 100;

  return Array.from({ length: tableSize }, (_, index) => {
    const inputLevel = index / Math.max(1, tableSize - 1);
    const gsdfLevel = getGsdfDisplayCode(inputLevel, normalized.lmax, normalized.inputGamma);
    const mixedLevel = inputLevel + (gsdfLevel - inputLevel) * strengthRatio;

    return Number(clampNumber(mixedLevel, 0, 1, inputLevel).toFixed(5));
  });
}

export interface GSDFStripeRow {
  id: string;
  label: string;
  left: number;
  right: number;
}

export function buildGsdfStripeRows(lmax: number, inputGamma = INPUT_GAMMA_DEFAULT): GSDFStripeRow[] {
  const maxLuminance = clampLuminance(lmax);
  const minLuminance = Math.min(GSDF_DISPLAY_LMIN_NITS, maxLuminance * 0.01);
  const jndMin = luminanceToGsdfJnd(minLuminance);
  const jndMax = luminanceToGsdfJnd(maxLuminance);
  const jndRange = jndMax - jndMin;
  const rows = [
    { id: 'dark', label: 'LOW', ratio: 0.08, deltaJnd: 6 },
    { id: 'shadow', label: 'DARK', ratio: 0.22, deltaJnd: 5 },
    { id: 'mid', label: 'MID', ratio: 0.48, deltaJnd: 4 },
    { id: 'bright', label: 'HIGH', ratio: 0.74, deltaJnd: 3 },
  ];

  return rows.map((row) => {
    const baseRatio = clampNumber(row.ratio, 0, 1, 0);
    const nextRatio = clampNumber(baseRatio + row.deltaJnd / Math.max(1, jndRange), 0, 1, baseRatio);

    return {
      id: row.id,
      label: row.label,
      left: Math.round(getGsdfDisplayCode(baseRatio, maxLuminance, inputGamma) * 255),
      right: Math.round(getGsdfDisplayCode(nextRatio, maxLuminance, inputGamma) * 255),
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
    inputGamma: clampInputGamma(settings.inputGamma),
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
