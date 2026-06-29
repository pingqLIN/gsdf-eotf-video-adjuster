export const EPSILON = 1e-6;

export interface SourceTransferCurve {
  kind: 'linear' | 'srgb' | 'gamma';
  gamma?: number;
}

export function clampNumber(value: unknown, min: number, max: number, fallback = min): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

export function clamp01(value: unknown, fallback = 0): number {
  return clampNumber(value, 0, 1, fallback);
}

export function normalizeGamma(value: unknown, fallback = 2.2): number {
  return clampNumber(value, 0.1, 5, fallback);
}

export function gammaToLinear(value: number, gamma: number): number {
  const normalized = clamp01(value);
  const exponent = normalizeGamma(gamma);

  return Math.pow(normalized, exponent);
}

export function linearToGamma(value: number, gamma: number): number {
  const normalized = clamp01(value);
  const exponent = normalizeGamma(gamma);

  return Math.pow(normalized, 1 / exponent);
}

export function srgbToLinear(value: number): number {
  const normalized = clamp01(value);

  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }

  return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(value: number): number {
  const normalized = clamp01(value);

  if (normalized <= 0.0031308) {
    return normalized * 12.92;
  }

  return 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055;
}

export function decodeSourceTransfer(value: number, sourceTransfer: SourceTransferCurve): number {
  if (sourceTransfer.kind === 'linear') {
    return clamp01(value);
  }

  if (sourceTransfer.kind === 'srgb') {
    return srgbToLinear(value);
  }

  return gammaToLinear(value, sourceTransfer.gamma ?? 2.2);
}

export function sampleLinear(table: readonly number[], ratio: number): number {
  if (table.length === 0) {
    return clamp01(ratio);
  }

  if (table.length === 1) {
    return clamp01(table[0], clamp01(ratio));
  }

  const position = clamp01(ratio) * (table.length - 1);
  const lowIndex = Math.floor(position);
  const highIndex = Math.ceil(position);
  const mix = position - lowIndex;
  const lowValue = table[lowIndex] ?? ratio;
  const highValue = table[highIndex] ?? lowValue;

  return clamp01(lowValue + (highValue - lowValue) * mix, ratio);
}

export function repairMonotonicUnitTable(values: readonly number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  if (values.length === 1) {
    return [clamp01(values[0])];
  }

  const repaired = values.map((value) => clamp01(value));
  repaired[0] = 0;

  for (let index = 1; index < repaired.length; index += 1) {
    repaired[index] = Math.max(repaired[index - 1], repaired[index]);
  }

  repaired[repaired.length - 1] = 1;

  for (let index = repaired.length - 2; index >= 0; index -= 1) {
    repaired[index] = Math.min(repaired[index], repaired[index + 1]);
  }

  return repaired;
}

export function invertMonotonicUnitTable(values: readonly number[]): number[] {
  const table = repairMonotonicUnitTable(values);

  if (table.length <= 1) {
    return table;
  }

  return Array.from({ length: table.length }, (_, index) => {
    const target = index / (table.length - 1);
    let highIndex = table.findIndex((value) => value >= target);

    if (highIndex <= 0) {
      return 0;
    }

    if (highIndex === -1) {
      return 1;
    }

    const lowIndex = highIndex - 1;
    const lowValue = table[lowIndex] ?? 0;
    const highValue = table[highIndex] ?? 1;
    const span = highValue - lowValue;

    if (span <= EPSILON) {
      return highIndex / (table.length - 1);
    }

    const localRatio = (target - lowValue) / span;
    return clamp01((lowIndex + localRatio) / (table.length - 1));
  });
}

export function roundUnitTable(values: readonly number[], digits = 5): number[] {
  return values.map((value) => Number(clamp01(value).toFixed(digits)));
}

export function maxAbsoluteDifference(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let delta = 0;

  for (let index = 0; index < length; index += 1) {
    delta = Math.max(delta, Math.abs((left[index] ?? 0) - (right[index] ?? 0)));
  }

  return delta;
}
