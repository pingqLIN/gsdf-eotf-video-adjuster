import { clampNumber } from './curveMath';

export type DisplayPresetId = 'lcd-1000' | 'lcd-2000' | 'oled-true-black';

export interface DisplayDevicePreset {
  id: DisplayPresetId;
  label: string;
  contrastRatio?: number;
  blackFloorNits: number;
  oledToeNits?: number;
}

export const DEFAULT_DISPLAY_PRESET_ID: DisplayPresetId = 'lcd-1000';

export const DISPLAY_DEVICE_PRESETS: Record<DisplayPresetId, DisplayDevicePreset> = {
  'lcd-1000': {
    id: 'lcd-1000',
    label: 'LCD 1000:1',
    contrastRatio: 1000,
    blackFloorNits: 0.05,
  },
  'lcd-2000': {
    id: 'lcd-2000',
    label: 'High contrast LCD 2000:1',
    contrastRatio: 2000,
    blackFloorNits: 0.025,
  },
  'oled-true-black': {
    id: 'oled-true-black',
    label: 'OLED near-black floor',
    contrastRatio: 1_000_000,
    blackFloorNits: 0,
    oledToeNits: 0.0005,
  },
};

export function normalizeDisplayPresetId(value: unknown): DisplayPresetId {
  return value === 'lcd-1000' || value === 'lcd-2000' || value === 'oled-true-black'
    ? value
    : DEFAULT_DISPLAY_PRESET_ID;
}

export function resolveDisplayPreset(value: DisplayPresetId | DisplayDevicePreset | undefined): DisplayDevicePreset {
  if (typeof value === 'object' && value) {
    return value;
  }

  return DISPLAY_DEVICE_PRESETS[normalizeDisplayPresetId(value)];
}

export function resolveEffectiveBlackNits(lmax: unknown, preset: DisplayPresetId | DisplayDevicePreset | undefined): number {
  const displayPreset = resolveDisplayPreset(preset);
  const maxLuminance = clampNumber(lmax, 0.001, 4000, 100);
  const contrastBlack = displayPreset.contrastRatio
    ? maxLuminance / displayPreset.contrastRatio
    : 0;
  const oledToe = displayPreset.oledToeNits ?? 0;
  const blackNits = Math.max(displayPreset.blackFloorNits, contrastBlack, oledToe);

  return Math.min(maxLuminance * 0.25, Math.max(0.0001, blackNits));
}
