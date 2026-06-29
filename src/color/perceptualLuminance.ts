import { clamp01, clampNumber } from './curveMath';

export const GSDF_DISPLAY_LMIN_NITS = 0.05;
export const GSDF_JND_MIN = 1;
export const GSDF_JND_MAX = 1023;

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

export interface PerceptualLuminanceOptions {
  blackNits?: number;
}

export function gsdfTargetLuminanceNorm(
  inputNorm: number,
  lmax: number,
  options: PerceptualLuminanceOptions = {},
): number {
  const normalized = clamp01(inputNorm);
  const maxLuminance = clampNumber(lmax, GSDF_DISPLAY_LMIN_NITS + 0.001, 4000, 100);
  const minLuminance = Math.min(
    Math.max(options.blackNits ?? GSDF_DISPLAY_LMIN_NITS, GSDF_DISPLAY_LMIN_NITS),
    maxLuminance - 0.001,
  );
  const jndMin = luminanceToGsdfJnd(minLuminance);
  const jndMax = luminanceToGsdfJnd(maxLuminance);
  const jnd = jndMin + normalized * (jndMax - jndMin);
  const luminance = gsdfJndToLuminance(jnd);

  return clamp01(
    (luminance - minLuminance) / Math.max(0.0001, maxLuminance - minLuminance),
    normalized,
  );
}

export function csdfTargetLuminanceNorm(
  inputNorm: number,
  lmax: number,
  options: PerceptualLuminanceOptions = {},
): number {
  const normalized = clamp01(inputNorm);
  const shadowBias = Math.sin(Math.PI * normalized) * (1 - normalized * 0.35);
  const contrastInput = clamp01(normalized + shadowBias * 0.035, normalized);
  const gsdfLinear = gsdfTargetLuminanceNorm(contrastInput, lmax, options);
  const shadowToe = Math.sin(Math.PI * normalized) * Math.max(0, 1 - normalized);

  return clamp01(gsdfLinear + shadowToe * 0.012 * (1 - gsdfLinear), gsdfLinear);
}
