import {
  clamp01,
  clampNumber,
  decodeSourceTransfer,
  gammaToLinear,
  invertMonotonicUnitTable,
  linearToGamma,
  repairMonotonicUnitTable,
  roundUnitTable,
} from './curveMath';
import {
  type DisplayDevicePreset,
  type DisplayPresetId,
  DEFAULT_DISPLAY_PRESET_ID,
  resolveDisplayPreset,
  resolveEffectiveBlackNits,
} from './displayPresets';
import {
  type VirtualGamutId,
  getVirtualGamutPreset,
  normalizeVirtualGamutId,
} from './gamutPresets';
import {
  csdfTargetLuminanceNorm,
  gsdfTargetLuminanceNorm,
} from './perceptualLuminance';

export type ToneTransferFormula = 'gsdf' | 'csdf';
export type IccProfileIntent = 'compensation' | 'descriptive';

export interface ToneCurveSettings {
  lmax: number;
  gammaTarget: number;
  displayGamma: number;
  transferFormula: ToneTransferFormula;
  displayGamut: VirtualGamutId;
  strength: number;
  blackPoint: number;
  whitePoint: number;
}

export interface ToneCurveSnapshotMetadata {
  tableSize: number;
  transferFormula: ToneTransferFormula;
  displayGamut: VirtualGamutId;
  sourceTransferKind: 'linear' | 'srgb' | 'gamma';
  sourceTransferGamma?: number;
  displayPresetId: DisplayPresetId | string;
  displayBlackNits: number;
  displayWhiteNits: number;
  profileIntent: IccProfileIntent;
}

export interface ToneCurveSnapshot {
  inputNorm: number[];
  targetEotfNorm: number[];
  codeRemapNorm: number[];
  inverseCodeRemapNorm: number[];
  iccTrcNorm: number[];
  metadata: ToneCurveSnapshotMetadata;
}

export interface BuildToneCurveSnapshotOptions {
  tableSize?: number;
  displayPreset?: DisplayPresetId | DisplayDevicePreset;
  profileIntent?: IccProfileIntent;
  digits?: number;
}

export const DEFAULT_TONE_CURVE_SETTINGS: ToneCurveSettings = {
  lmax: 100,
  gammaTarget: 2.2,
  displayGamma: 2.2,
  transferFormula: 'csdf',
  displayGamut: 'srgb',
  strength: 100,
  blackPoint: 0,
  whitePoint: 256,
};

const DISPLAY_GAMMA_OPTIONS = [1, 1.8, 2.2, 2.4, 2.6] as const;

function normalizeGammaTarget(value: unknown): number {
  return Number(clampNumber(value, 1, 3, DEFAULT_TONE_CURVE_SETTINGS.gammaTarget).toFixed(3));
}

function normalizeDisplayGamma(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TONE_CURVE_SETTINGS.displayGamma;
  }

  const normalized = Number(numeric.toFixed(3));

  return (DISPLAY_GAMMA_OPTIONS as readonly number[]).includes(normalized)
    ? normalized
    : DEFAULT_TONE_CURVE_SETTINGS.displayGamma;
}

function normalizeTransferFormula(value: unknown): ToneTransferFormula {
  return value === 'gsdf' || value === 'csdf'
    ? value
    : DEFAULT_TONE_CURVE_SETTINGS.transferFormula;
}

function normalizeTableSize(value: unknown): number {
  return Math.max(2, Math.round(clampNumber(value, 2, 65536, 256)));
}

export function normalizeToneCurveSettings(value: Partial<ToneCurveSettings> | null | undefined): ToneCurveSettings {
  const settings = value ?? {};
  const displayGamma = normalizeDisplayGamma(settings.displayGamma);
  const gammaTarget = settings.gammaTarget === undefined || settings.gammaTarget === null
    ? displayGamma
    : normalizeGammaTarget(settings.gammaTarget);
  const blackPoint = Math.round(clampNumber(settings.blackPoint, 0, 16, DEFAULT_TONE_CURVE_SETTINGS.blackPoint));
  let whitePoint = Math.round(clampNumber(settings.whitePoint, 240, 256, DEFAULT_TONE_CURVE_SETTINGS.whitePoint));

  if (whitePoint <= blackPoint) {
    whitePoint = Math.min(256, blackPoint + 1);
  }

  return {
    lmax: clampNumber(settings.lmax, 10, 500, DEFAULT_TONE_CURVE_SETTINGS.lmax),
    gammaTarget,
    displayGamma,
    transferFormula: normalizeTransferFormula(settings.transferFormula),
    displayGamut: normalizeVirtualGamutId(settings.displayGamut),
    strength: clampNumber(settings.strength, 0, 100, DEFAULT_TONE_CURVE_SETTINGS.strength),
    blackPoint,
    whitePoint,
  };
}

export function buildToneCurveSnapshot(
  rawSettings: Partial<ToneCurveSettings> | null | undefined,
  options: BuildToneCurveSnapshotOptions = {},
): ToneCurveSnapshot {
  const settings = normalizeToneCurveSettings(rawSettings);
  const tableSize = normalizeTableSize(options.tableSize);
  const digits = Math.round(clampNumber(options.digits, 0, 8, 5));
  const displayPreset = resolveDisplayPreset(options.displayPreset ?? DEFAULT_DISPLAY_PRESET_ID);
  const displayBlackNits = resolveEffectiveBlackNits(settings.lmax, displayPreset);
  const gamutPreset = getVirtualGamutPreset(settings.displayGamut);
  const strengthRatio = settings.strength / 100;
  const blackCode = clamp01(settings.blackPoint / 256);
  const whiteCode = clamp01(settings.whitePoint / 256, 1);
  const usableCodeRange = Math.max(1 / 256, whiteCode - blackCode);
  const inputNorm = Array.from({ length: tableSize }, (_, index) => index / (tableSize - 1));
  const targetRaw = inputNorm.map((inputCode) => {
    const leveledInputCode = clamp01((inputCode - blackCode) / usableCodeRange, inputCode);
    const baselineCode = linearToGamma(gammaToLinear(leveledInputCode, settings.gammaTarget), settings.displayGamma);
    const baselineLinear = gammaToLinear(baselineCode, settings.displayGamma);
    const perceptualLinear = settings.transferFormula === 'csdf'
      ? csdfTargetLuminanceNorm(baselineCode, settings.lmax, { blackNits: displayBlackNits })
      : gsdfTargetLuminanceNorm(baselineCode, settings.lmax, { blackNits: displayBlackNits });

    return clamp01(baselineLinear + (perceptualLinear - baselineLinear) * strengthRatio, baselineLinear);
  });
  const targetEotfNorm = roundUnitTable(repairMonotonicUnitTable(targetRaw), digits);
  const codeRemapNorm = roundUnitTable(
    repairMonotonicUnitTable(targetEotfNorm.map((value) => linearToGamma(value, settings.displayGamma))),
    digits,
  );
  const inverseCodeRemapNorm = roundUnitTable(invertMonotonicUnitTable(codeRemapNorm), digits);
  const profileIntent = options.profileIntent ?? 'compensation';
  const iccRaw = profileIntent === 'descriptive'
    ? targetEotfNorm
    : inverseCodeRemapNorm.map((sourceCode) => decodeSourceTransfer(sourceCode, gamutPreset.sourceTransfer));
  const iccTrcNorm = roundUnitTable(repairMonotonicUnitTable(iccRaw), digits);

  return {
    inputNorm: roundUnitTable(inputNorm, digits),
    targetEotfNorm,
    codeRemapNorm,
    inverseCodeRemapNorm,
    iccTrcNorm,
    metadata: {
      tableSize,
      transferFormula: settings.transferFormula,
      displayGamut: gamutPreset.id,
      sourceTransferKind: gamutPreset.sourceTransfer.kind,
      sourceTransferGamma: gamutPreset.sourceTransfer.gamma,
      displayPresetId: displayPreset.id,
      displayBlackNits,
      displayWhiteNits: settings.lmax,
      profileIntent,
    },
  };
}
