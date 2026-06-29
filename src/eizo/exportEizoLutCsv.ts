import type { ToneCurveSnapshot } from '../color/buildToneCurveSnapshot';
import { clamp01, clampNumber } from '../color/curveMath';

export interface EizoLutCsvOptions {
  minPositiveValue?: number;
  precision?: number;
}

export const EIZO_GAMMA_LUT_SAMPLE_COUNT = 256;
const DEFAULT_MIN_POSITIVE_VALUE = 1e-6;
const DEFAULT_PRECISION = 10;

function normalizeMinPositiveValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_MIN_POSITIVE_VALUE;
}

function normalizePrecision(value: unknown): number {
  return Math.round(clampNumber(value, 0, 16, DEFAULT_PRECISION));
}

export function buildEizoGammaLutValues(
  snapshot: Pick<ToneCurveSnapshot, 'targetEotfNorm'>,
  options: EizoLutCsvOptions = {},
): number[] {
  if (snapshot.targetEotfNorm.length !== EIZO_GAMMA_LUT_SAMPLE_COUNT) {
    throw new Error(
      `EIZO Gamma LUT CSV requires exactly ${EIZO_GAMMA_LUT_SAMPLE_COUNT} samples, got ${snapshot.targetEotfNorm.length}`,
    );
  }

  const minPositive = normalizeMinPositiveValue(options.minPositiveValue);
  const values = snapshot.targetEotfNorm.map((value) => Math.max(minPositive, clamp01(value)));

  for (let index = 1; index < values.length; index += 1) {
    values[index] = Math.max(values[index], values[index - 1]);
  }

  values[values.length - 1] = Math.max(1, ...values);
  const maxValue = values[values.length - 1];

  for (let index = 0; index < values.length; index += 1) {
    values[index] = clamp01(values[index] / maxValue, minPositive);
  }

  values[0] = Math.max(minPositive, values[0]);
  values[values.length - 1] = 1;

  return values;
}

export function buildEizoGammaLutCsv(
  snapshot: Pick<ToneCurveSnapshot, 'targetEotfNorm'>,
  options: EizoLutCsvOptions = {},
): string {
  const precision = normalizePrecision(options.precision);
  const values = buildEizoGammaLutValues(snapshot, options);

  return `${values.map((value) => value.toFixed(precision)).join('\n')}\n`;
}

export function validateEizoGammaLutCsv(csv: string): string[] {
  const trimmed = csv.trim();
  const lines = trimmed.length === 0 ? [] : trimmed.split(/\r?\n/);
  const errors: string[] = [];

  if (lines.length !== EIZO_GAMMA_LUT_SAMPLE_COUNT) {
    errors.push(`Expected ${EIZO_GAMMA_LUT_SAMPLE_COUNT} lines, got ${lines.length}`);
  }

  const values = lines.map((line, index) => {
    if (line.includes(',')) {
      errors.push(`Line ${index + 1} must not contain comma`);
    }

    const value = Number(line.trim());
    if (!Number.isFinite(value)) {
      errors.push(`Line ${index + 1} is not a finite number`);
    } else if (!(value > 0)) {
      errors.push(`Line ${index + 1} must be > 0`);
    }

    return value;
  });

  for (let index = 1; index < values.length; index += 1) {
    if (Number.isFinite(values[index]) && Number.isFinite(values[index - 1]) && values[index] < values[index - 1]) {
      errors.push(`Curve is not monotonic at line ${index + 1}`);
    }
  }

  if (values.length === EIZO_GAMMA_LUT_SAMPLE_COUNT) {
    const lastValue = values[values.length - 1];
    const maxValue = Math.max(...values);
    if (lastValue !== maxValue) {
      errors.push('The 256th value must be the highest value in the record');
    }
  }

  return errors;
}

function sanitizeNamePart(value: string): string {
  return value
    .replace(/display-p3/g, 'DisplayP3')
    .replace(/adobe-rgb/g, 'AdobeRGB')
    .replace(/srgb/g, 'sRGB')
    .replace(/[^A-Za-z0-9.]+/g, '')
    .slice(0, 48);
}

function formatBlackNits(value: number): string {
  return value < 0.01 ? value.toFixed(4) : value.toFixed(3);
}

export function buildEizoGammaLutFileName(snapshot: Pick<ToneCurveSnapshot, 'metadata'>): string {
  const metadata = snapshot.metadata;
  const formula = metadata.transferFormula.toUpperCase();
  const gamut = sanitizeNamePart(metadata.displayGamut);
  const preset = sanitizeNamePart(String(metadata.displayPresetId));
  const luminance = Math.round(metadata.targetLuminanceNits);
  const black = formatBlackNits(metadata.displayBlackNits);
  const strength = Math.round(metadata.strength);

  return `LumaLift-${formula}_EIZO_${gamut}_${preset}_L${luminance}_B${black}_S${strength}.csv`;
}
