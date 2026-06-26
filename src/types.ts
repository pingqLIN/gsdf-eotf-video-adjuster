export interface AppSettings {
  enabled: boolean;
  lmax: number;
  curveMode: GsdfCurveMode;
  gammaTarget: number;
  displayGamma: number;
  sourceIsLinear: boolean;
  displayGamut: DisplayGamut;
  strength: number;
  blackPoint: number;
  whitePoint: number;
  fineSharpness: number;
  mediumSharpness: number;
  temperature: number;
  saturation: number;
  grayscale: boolean;
  hue: number;
}

export type GsdfCurveMode = 'relative';
export type DisplayGamut = 'srgb' | 'display-p3' | 'adobe-rgb';

export const LUMINANCE_MIN_NITS = 10;
export const LUMINANCE_MAX_NITS = 500;
export const DEFAULT_TARGET_LUMINANCE_NITS = 100;
export const LUMINANCE_SLIDER_MAX = 1000;
export const GAMMA_TARGET_MIN = 1.0;
export const GAMMA_TARGET_MAX = 3.0;
export const DEFAULT_GAMMA_TARGET = 2.2;
export const DISPLAY_GAMMA_OPTIONS = [1, 1.8, 2.2, 2.4, 2.6] as const;
export const DEFAULT_DISPLAY_GAMUT: DisplayGamut = 'srgb';
export const GAMMA_CORRECTION_MIN = -100;
export const GAMMA_CORRECTION_MAX = 100;
export const TONE_LEVEL_COUNT = 256;
export const BLACK_CLIP_TONE_MIN = 0;
export const BLACK_CLIP_TONE_MAX = 16;
export const WHITE_CLIP_TONE_MIN = 240;
export const WHITE_CLIP_TONE_MAX = 256;
export const SATURATION_MIN = 50;
export const SATURATION_MAX = 150;
export const TEMPERATURE_MIN_K = -1000;
export const TEMPERATURE_MAX_K = 1000;
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
const DEFAULT_BLACK_POINT = 0;
const DEFAULT_WHITE_POINT = TONE_LEVEL_COUNT;
const DEFAULT_SATURATION = 100;

function clampRecommendedLuminance(value: unknown): number {
  const numeric = Number(value);
  const clamped = Number.isFinite(numeric)
    ? Math.max(LUMINANCE_MIN_NITS, Math.min(LUMINANCE_MAX_NITS, numeric))
    : DEFAULT_TARGET_LUMINANCE_NITS;

  return Number(clamped.toFixed(clamped < 100 ? 1 : 0));
}

export function getRecommendedImageDefaults(
  lmax: unknown,
): Pick<AppSettings, 'displayGamut' | 'blackPoint' | 'whitePoint' | 'saturation'> {
  clampRecommendedLuminance(lmax);

  return {
    displayGamut: DEFAULT_DISPLAY_GAMUT,
    blackPoint: DEFAULT_BLACK_POINT,
    whitePoint: DEFAULT_WHITE_POINT,
    saturation: DEFAULT_SATURATION,
  };
}

const DEFAULT_IMAGE_SETTINGS = getRecommendedImageDefaults(DEFAULT_TARGET_LUMINANCE_NITS);

export const DEFAULT_APP_SETTINGS: AppSettings = {
  enabled: false,
  lmax: DEFAULT_TARGET_LUMINANCE_NITS,
  curveMode: 'relative',
  gammaTarget: DEFAULT_GAMMA_TARGET,
  displayGamma: DEFAULT_GAMMA_TARGET,
  sourceIsLinear: false,
  displayGamut: DEFAULT_IMAGE_SETTINGS.displayGamut,
  strength: 100,
  blackPoint: DEFAULT_IMAGE_SETTINGS.blackPoint,
  whitePoint: DEFAULT_IMAGE_SETTINGS.whitePoint,
  fineSharpness: 0,
  mediumSharpness: 0,
  temperature: 0,
  saturation: DEFAULT_IMAGE_SETTINGS.saturation,
  grayscale: false,
  hue: 0,
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

function normalizeCurveMode(_value: unknown): GsdfCurveMode {
  return DEFAULT_APP_SETTINGS.curveMode;
}

function normalizeDisplayGamut(value: unknown): DisplayGamut {
  return value === 'srgb' || value === 'display-p3' || value === 'adobe-rgb'
    ? value
    : DEFAULT_APP_SETTINGS.displayGamut;
}

function hasNewImageControlSchema(settings: Partial<AppSettings> & { sharpness?: unknown }): boolean {
  return (
    settings.displayGamma !== undefined ||
    settings.fineSharpness !== undefined ||
    settings.mediumSharpness !== undefined ||
    settings.grayscale !== undefined ||
    Number(settings.whitePoint) > 100 ||
    Math.abs(Number(settings.temperature)) > 50
  );
}

function migrateLegacyWhitePercent(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  const percent = clampNumber(value, 80, 100, 90);
  const tone = percent <= 90
    ? 240 + (percent - 80)
    : 250 + (percent - 90) * 0.6;

  return Math.round(clampNumber(tone, WHITE_CLIP_TONE_MIN, WHITE_CLIP_TONE_MAX, fallback));
}

function migrateLegacyTemperature(value: unknown): number {
  return Math.round(clampNumber(value, -50, 50, 0) * 20);
}

function normalizeGammaTarget(value: unknown): number {
  return Number(clampNumber(value, GAMMA_TARGET_MIN, GAMMA_TARGET_MAX, DEFAULT_APP_SETTINGS.gammaTarget).toFixed(3));
}

function normalizeDisplayGamma(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_GAMMA_TARGET;
  }

  const normalized = Number(numeric.toFixed(3));

  if ((DISPLAY_GAMMA_OPTIONS as readonly number[]).includes(normalized)) {
    return normalized;
  }

  return DEFAULT_GAMMA_TARGET;
}

export function gammaCorrectionToTarget(value: unknown): number {
  const correction = clampNumber(value, GAMMA_CORRECTION_MIN, GAMMA_CORRECTION_MAX, 0);

  if (correction < 0) {
    const ratio = Math.abs(correction) / Math.abs(GAMMA_CORRECTION_MIN);
    return normalizeGammaTarget(DEFAULT_GAMMA_TARGET + (GAMMA_TARGET_MAX - DEFAULT_GAMMA_TARGET) * ratio);
  }

  const ratio = correction / GAMMA_CORRECTION_MAX;
  return normalizeGammaTarget(DEFAULT_GAMMA_TARGET - (DEFAULT_GAMMA_TARGET - GAMMA_TARGET_MIN) * ratio);
}

export function gammaTargetToCorrection(value: unknown): number {
  const target = normalizeGammaTarget(value);

  if (target > DEFAULT_GAMMA_TARGET) {
    return Math.round(-((target - DEFAULT_GAMMA_TARGET) / (GAMMA_TARGET_MAX - DEFAULT_GAMMA_TARGET)) * Math.abs(GAMMA_CORRECTION_MIN));
  }

  if (target < DEFAULT_GAMMA_TARGET) {
    return Math.round(((DEFAULT_GAMMA_TARGET - target) / (DEFAULT_GAMMA_TARGET - GAMMA_TARGET_MIN)) * GAMMA_CORRECTION_MAX);
  }

  return 0;
}

export function clampLuminance(value: unknown): number {
  return roundLuminance(clampNumber(value, LUMINANCE_MIN_NITS, LUMINANCE_MAX_NITS, DEFAULT_TARGET_LUMINANCE_NITS));
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

export function getGsdfDisplayCode(
  inputLevel: number,
  lmax: number,
  displayGamma = DEFAULT_GAMMA_TARGET,
): number {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const maxLuminance = clampLuminance(lmax);
  const deviceGamma = normalizeDisplayGamma(displayGamma);
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

  return clampNumber(Math.pow(linearDisplayLevel, 1 / deviceGamma), 0, 1, normalized);
}

export function getGammaAdjustedInputLevel(
  inputLevel: number,
  gammaTarget: number,
  displayGamma = DEFAULT_GAMMA_TARGET,
): number {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const targetGamma = normalizeGammaTarget(gammaTarget);
  const deviceGamma = normalizeDisplayGamma(displayGamma);
  const exponent = targetGamma / deviceGamma;

  return clampNumber(Math.pow(normalized, exponent), 0, 1, normalized);
}

export function buildGsdfTableValues(settings: Partial<AppSettings>, tableSize = 256): number[] {
  const normalized = normalizeAppSettings(settings);
  const filterAmount = normalized.strength / 100;

  return Array.from({ length: tableSize }, (_, index) => {
    const inputLevel = index / Math.max(1, tableSize - 1);
    const baselineLevel = getGammaAdjustedInputLevel(
      inputLevel,
      normalized.gammaTarget,
      normalized.displayGamma,
    );
    const gsdfLevel = getGsdfDisplayCode(baselineLevel, normalized.lmax, normalized.displayGamma);
    const mixedLevel = baselineLevel + (gsdfLevel - baselineLevel) * filterAmount;

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
  const legacySettings = settings as Partial<AppSettings> & { sharpness?: unknown };
  const lmax = clampLuminance(settings.lmax);
  const recommendedImageSettings = getRecommendedImageDefaults(lmax);
  const fallbackFineSharpness = clampNumber(legacySettings.sharpness, 0, 50, DEFAULT_APP_SETTINGS.fineSharpness);
  const usesLegacyImageSchema = !hasNewImageControlSchema(legacySettings);
  const blackPoint = usesLegacyImageSchema
    ? Math.round(clampNumber(settings.blackPoint, BLACK_CLIP_TONE_MIN, BLACK_CLIP_TONE_MAX, recommendedImageSettings.blackPoint))
    : Math.round(clampNumber(settings.blackPoint, BLACK_CLIP_TONE_MIN, BLACK_CLIP_TONE_MAX, recommendedImageSettings.blackPoint));
  const whitePoint = usesLegacyImageSchema
    ? migrateLegacyWhitePercent(settings.whitePoint, recommendedImageSettings.whitePoint)
    : Math.round(clampNumber(settings.whitePoint, WHITE_CLIP_TONE_MIN, WHITE_CLIP_TONE_MAX, recommendedImageSettings.whitePoint));
  const temperature = usesLegacyImageSchema
    ? migrateLegacyTemperature(settings.temperature)
    : Math.round(clampNumber(settings.temperature, TEMPERATURE_MIN_K, TEMPERATURE_MAX_K, DEFAULT_APP_SETTINGS.temperature));
  const normalized: AppSettings = {
    enabled: settings.enabled === true,
    lmax,
    curveMode: normalizeCurveMode(settings.curveMode),
    gammaTarget: normalizeGammaTarget(settings.gammaTarget),
    displayGamma: normalizeDisplayGamma(settings.displayGamma),
    sourceIsLinear: false,
    displayGamut: normalizeDisplayGamut(settings.displayGamut),
    strength: clampNumber(settings.strength, 0, 100, DEFAULT_APP_SETTINGS.strength),
    blackPoint,
    whitePoint,
    fineSharpness: Math.round(clampNumber(settings.fineSharpness, 0, 50, fallbackFineSharpness)),
    mediumSharpness: Math.round(clampNumber(settings.mediumSharpness, 0, 40, DEFAULT_APP_SETTINGS.mediumSharpness)),
    temperature,
    saturation: Math.round(clampNumber(settings.saturation, SATURATION_MIN, SATURATION_MAX, recommendedImageSettings.saturation)),
    grayscale: settings.grayscale === true,
    hue: clampNumber(settings.hue, -30, 30, DEFAULT_APP_SETTINGS.hue),
  };

  if (normalized.whitePoint <= normalized.blackPoint) {
    normalized.whitePoint = Math.min(WHITE_CLIP_TONE_MAX, normalized.blackPoint + 1);
  }

  return normalized;
}
