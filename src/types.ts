import {
  buildToneCurveSnapshot as buildToneCurveSnapshotCore,
} from './color/buildToneCurveSnapshot';
export {
  buildToneCurveSnapshot,
  normalizeToneCurveSettings,
  DEFAULT_TONE_CURVE_SETTINGS,
} from './color/buildToneCurveSnapshot';
export type {
  BuildToneCurveSnapshotOptions,
  IccProfileIntent,
  ToneCurveSettings,
  ToneCurveSnapshot,
  ToneCurveSnapshotMetadata,
} from './color/buildToneCurveSnapshot';
import { linearToGamma } from './color/curveMath';
import { VIRTUAL_GAMUT_PRESETS } from './color/gamutPresets';
import {
  buildHard8JndOptimizationModel,
  DEFAULT_HARD8_JND_LEVELS,
  normalizeHard8JndLevelCount,
} from './color/hard8JndOptimization';
export {
  DEFAULT_HARD8_JND_LEVELS,
  HARD8_JND_LEVEL_MAX,
  HARD8_JND_LEVEL_MIN,
} from './color/hard8JndOptimization';
import {
  GSDF_DISPLAY_LMIN_NITS,
  gsdfJndToLuminance as calculateGsdfJndToLuminance,
  gsdfTargetLuminanceNorm,
  luminanceToGsdfJnd as calculateLuminanceToGsdfJnd,
} from './color/perceptualLuminance';
export interface AppSettings {
  enabled: boolean;
  lmax: number;
  curveMode: GsdfCurveMode;
  gammaTarget: number;
  displayGamma: number;
  sourceIsLinear: boolean;
  transferFormula: TransferFormulaMode;
  gsdfPipeline: GsdfPipelineMode;
  displayGamut: DisplayGamut;
  strength: number;
  blackPoint: number;
  whitePoint: number;
  fineSharpness: number;
  mediumSharpness: number;
  temperature: number;
  saturation: number;
  grayscale: boolean;
  dither: boolean;
  ditherStrength: number;
  ditherColor: boolean;
  ditherNoise: boolean;
  hue: number;
  hard8JndOptimizationEnabled: boolean;
  hard8JndLevelCount: number;
}

export type GsdfCurveMode = 'relative';
export type TransferFormulaMode = 'gsdf' | 'csdf';
export type GsdfPipelineMode = 'ycbcr' | 'rgb';
export type DisplayGamut = 'srgb' | 'display-p3' | 'adobe-rgb';

export const LUMINANCE_MIN_NITS = 10;
export const LUMINANCE_MAX_NITS = 500;
export const DEFAULT_TARGET_LUMINANCE_NITS = 100;
export const LUMINANCE_SLIDER_MAX = 1000;
export const GAMMA_TARGET_MIN = 1.0;
export const GAMMA_TARGET_MAX = 3.0;
export const DEFAULT_GAMMA_TARGET = 2.2;
export const DISPLAY_GAMMA_OPTIONS = [1, 1.8, 2.2, 2.4, 2.6] as const;
export const DEFAULT_TRANSFER_FORMULA: TransferFormulaMode = 'csdf';
export const DEFAULT_GSDF_PIPELINE: GsdfPipelineMode = 'ycbcr';
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
export const DITHER_STRENGTH_MIN = 1;
export const DITHER_STRENGTH_MAX = 5;
export const DEFAULT_DITHER_STRENGTH = 2;
const LUMINANCE_LOG_RANGE = Math.log(LUMINANCE_MAX_NITS / LUMINANCE_MIN_NITS);
const DEFAULT_BLACK_POINT = 0;
const DEFAULT_WHITE_POINT = TONE_LEVEL_COUNT;
const DEFAULT_SATURATION = 100;
const DISPLAY_GAMUT_PROFILES = VIRTUAL_GAMUT_PRESETS;

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
  transferFormula: DEFAULT_TRANSFER_FORMULA,
  gsdfPipeline: DEFAULT_GSDF_PIPELINE,
  displayGamut: DEFAULT_IMAGE_SETTINGS.displayGamut,
  strength: 100,
  blackPoint: DEFAULT_IMAGE_SETTINGS.blackPoint,
  whitePoint: DEFAULT_IMAGE_SETTINGS.whitePoint,
  fineSharpness: 0,
  mediumSharpness: 0,
  temperature: 0,
  saturation: DEFAULT_IMAGE_SETTINGS.saturation,
  grayscale: false,
  dither: false,
  ditherStrength: DEFAULT_DITHER_STRENGTH,
  ditherColor: false,
  ditherNoise: true,
  hue: 0,
  hard8JndOptimizationEnabled: false,
  hard8JndLevelCount: DEFAULT_HARD8_JND_LEVELS,
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

export function buildLumaChromaMatrices(displayGamut: unknown) {
  const { kr, kg, kb } = DISPLAY_GAMUT_PROFILES[normalizeDisplayGamut(displayGamut)];
  const cbScale = 2 * (1 - kb);
  const crScale = 2 * (1 - kr);
  const redFromCr = crScale;
  const blueFromCb = cbScale;
  const greenFromCb = -(kb * blueFromCb) / kg;
  const greenFromCr = -(kr * redFromCr) / kg;

  return {
    forward: [
      kr, kg, kb, 0, 0,
      -kr / cbScale, -kg / cbScale, (1 - kb) / cbScale, 0, 0.5,
      (1 - kr) / crScale, -kg / crScale, -kb / crScale, 0, 0.5,
      0, 0, 0, 1, 0,
    ],
    inverse: [
      1, 0, redFromCr, 0, -0.5 * redFromCr,
      1, greenFromCb, greenFromCr, 0, -0.5 * (greenFromCb + greenFromCr),
      1, blueFromCb, 0, 0, -0.5 * blueFromCb,
      0, 0, 0, 1, 0,
    ],
  };
}

function normalizeTransferFormula(value: unknown): TransferFormulaMode {
  return value === 'gsdf' || value === 'csdf' ? value : DEFAULT_APP_SETTINGS.transferFormula;
}

function normalizeGsdfPipeline(value: unknown): GsdfPipelineMode {
  return value === 'rgb' ? 'rgb' : DEFAULT_APP_SETTINGS.gsdfPipeline;
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

export function gammaCorrectionToTarget(value: unknown, neutralGamma: unknown = DEFAULT_GAMMA_TARGET): number {
  const correction = clampNumber(value, GAMMA_CORRECTION_MIN, GAMMA_CORRECTION_MAX, 0);
  const neutralTarget = normalizeGammaTarget(neutralGamma);

  if (correction < 0) {
    const ratio = Math.abs(correction) / Math.abs(GAMMA_CORRECTION_MIN);
    return normalizeGammaTarget(neutralTarget + (GAMMA_TARGET_MAX - neutralTarget) * ratio);
  }

  const ratio = correction / GAMMA_CORRECTION_MAX;
  return normalizeGammaTarget(neutralTarget - (neutralTarget - GAMMA_TARGET_MIN) * ratio);
}

export function gammaTargetToCorrection(value: unknown, neutralGamma: unknown = DEFAULT_GAMMA_TARGET): number {
  const target = normalizeGammaTarget(value);
  const neutralTarget = normalizeGammaTarget(neutralGamma);

  if (target > neutralTarget) {
    const upperRange = Math.max(0.001, GAMMA_TARGET_MAX - neutralTarget);
    return Math.round(-((target - neutralTarget) / upperRange) * Math.abs(GAMMA_CORRECTION_MIN));
  }

  if (target < neutralTarget) {
    const lowerRange = Math.max(0.001, neutralTarget - GAMMA_TARGET_MIN);
    return Math.round(((neutralTarget - target) / lowerRange) * GAMMA_CORRECTION_MAX);
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
  return calculateGsdfJndToLuminance(jndIndex);
}

export function luminanceToGsdfJnd(luminance: number): number {
  return calculateLuminanceToGsdfJnd(luminance);
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
  const linearDisplayLevel = gsdfTargetLuminanceNorm(normalized, maxLuminance, { blackNits: minLuminance });

  return linearToGamma(linearDisplayLevel, deviceGamma);
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
  return buildToneCurveSnapshotCore(normalized, { tableSize }).codeRemapNorm;
}

export function buildActiveTransferTableValues(settings: Partial<AppSettings>, tableSize = 256): number[] {
  const normalized = normalizeAppSettings(settings);
  if (!normalized.hard8JndOptimizationEnabled || tableSize !== TONE_LEVEL_COUNT) {
    return buildGsdfTableValues(normalized, tableSize);
  }

  return buildHard8JndOptimizationModel(
    normalized,
    normalized.hard8JndLevelCount,
  ).optimizedCodeRemapNorm;
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
  const transferTable = buildActiveTransferTableValues(normalized);

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
  const legacySettings = settings as Partial<AppSettings> & { colorModel?: unknown; sharpness?: unknown };
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
  const displayGamma = normalizeDisplayGamma(settings.displayGamma);
  const gammaTarget = settings.gammaTarget === undefined || settings.gammaTarget === null
    ? displayGamma
    : normalizeGammaTarget(settings.gammaTarget);
  const normalized: AppSettings = {
    enabled: settings.enabled === true,
    lmax,
    curveMode: normalizeCurveMode(settings.curveMode),
    gammaTarget,
    displayGamma,
    sourceIsLinear: false,
    transferFormula: normalizeTransferFormula(settings.transferFormula),
    gsdfPipeline: normalizeGsdfPipeline(settings.gsdfPipeline ?? legacySettings.colorModel),
    displayGamut: normalizeDisplayGamut(settings.displayGamut),
    strength: clampNumber(settings.strength, 0, 100, DEFAULT_APP_SETTINGS.strength),
    blackPoint,
    whitePoint,
    fineSharpness: Math.round(clampNumber(settings.fineSharpness, 0, 50, fallbackFineSharpness)),
    mediumSharpness: Math.round(clampNumber(settings.mediumSharpness, 0, 40, DEFAULT_APP_SETTINGS.mediumSharpness)),
    temperature,
    saturation: Math.round(clampNumber(settings.saturation, SATURATION_MIN, SATURATION_MAX, recommendedImageSettings.saturation)),
    grayscale: settings.grayscale === true,
    dither: settings.dither === true,
    ditherStrength: Math.round(clampNumber(settings.ditherStrength, DITHER_STRENGTH_MIN, DITHER_STRENGTH_MAX, DEFAULT_APP_SETTINGS.ditherStrength)),
    ditherColor: settings.ditherColor === true,
    ditherNoise: settings.ditherNoise !== false,
    hue: clampNumber(settings.hue, -30, 30, DEFAULT_APP_SETTINGS.hue),
    hard8JndOptimizationEnabled: settings.hard8JndOptimizationEnabled === true,
    hard8JndLevelCount: normalizeHard8JndLevelCount(settings.hard8JndLevelCount),
  };

  if (normalized.whitePoint <= normalized.blackPoint) {
    normalized.whitePoint = Math.min(WHITE_CLIP_TONE_MAX, normalized.blackPoint + 1);
  }

  return normalized;
}
