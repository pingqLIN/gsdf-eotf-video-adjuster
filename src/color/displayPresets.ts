import { clampNumber } from './curveMath';

export type DisplayPresetId = 'ips-1000' | 'black-ips-2000' | 'oled-zero-black';
export type DisplayPresetAlias = 'lcd-1000' | 'lcd-2000' | 'oled-true-black';
export type DisplayPresetInput = DisplayPresetId | DisplayPresetAlias;

export interface DisplayDevicePreset {
  id: DisplayPresetId;
  label: string;
  contrastRatio?: number;
  blackFloorNits: number;
  oledToeNits?: number;
}

export const DEFAULT_DISPLAY_PRESET_ID: DisplayPresetId = 'ips-1000';

export const DISPLAY_DEVICE_PRESETS: Record<DisplayPresetId, DisplayDevicePreset> = {
  'ips-1000': {
    id: 'ips-1000',
    label: 'IPS 1000:1',
    contrastRatio: 1000,
    blackFloorNits: 0.05,
  },
  'black-ips-2000': {
    id: 'black-ips-2000',
    label: 'Black IPS 2000:1',
    contrastRatio: 2000,
    blackFloorNits: 0.025,
  },
  'oled-zero-black': {
    id: 'oled-zero-black',
    label: 'OLED zero black',
    contrastRatio: 1_000_000,
    blackFloorNits: 0,
    oledToeNits: 0.0005,
  },
};

const DISPLAY_PRESET_ALIASES: Record<DisplayPresetAlias, DisplayPresetId> = {
  'lcd-1000': 'ips-1000',
  'lcd-2000': 'black-ips-2000',
  'oled-true-black': 'oled-zero-black',
};

export function normalizeDisplayPresetId(value: unknown): DisplayPresetId {
  if (value === 'ips-1000' || value === 'black-ips-2000' || value === 'oled-zero-black') {
    return value;
  }

  if (value === 'lcd-1000' || value === 'lcd-2000' || value === 'oled-true-black') {
    return DISPLAY_PRESET_ALIASES[value];
  }

  return DEFAULT_DISPLAY_PRESET_ID;
}

export function resolveDisplayPreset(value: DisplayPresetInput | DisplayDevicePreset | undefined): DisplayDevicePreset {
  if (typeof value === 'object' && value) {
    return value;
  }

  return DISPLAY_DEVICE_PRESETS[normalizeDisplayPresetId(value)];
}

export function resolveEffectiveBlackNits(lmax: unknown, preset: DisplayPresetInput | DisplayDevicePreset | undefined): number {
  const displayPreset = resolveDisplayPreset(preset);
  const maxLuminance = clampNumber(lmax, 0.001, 4000, 100);
  const contrastBlack = displayPreset.contrastRatio
    ? maxLuminance / displayPreset.contrastRatio
    : 0;
  const oledToe = displayPreset.oledToeNits ?? 0;
  const blackNits = Math.max(displayPreset.blackFloorNits, contrastBlack, oledToe);

  return Math.min(maxLuminance * 0.25, Math.max(0.0001, blackNits));
}