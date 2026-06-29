import type { SourceTransferCurve } from './curveMath';

export type VirtualGamutId = 'srgb' | 'display-p3' | 'adobe-rgb';

export interface XyChromaticity {
  x: number;
  y: number;
}

export interface VirtualGamutPreset {
  id: VirtualGamutId;
  label: string;
  kr: number;
  kg: number;
  kb: number;
  red: XyChromaticity;
  green: XyChromaticity;
  blue: XyChromaticity;
  white: XyChromaticity;
  sourceTransfer: SourceTransferCurve;
}

export const ADOBE_RGB_GAMMA = 563 / 256;

export const VIRTUAL_GAMUT_PRESETS: Record<VirtualGamutId, VirtualGamutPreset> = {
  srgb: {
    id: 'srgb',
    label: 'sRGB',
    kr: 0.2126,
    kg: 0.7152,
    kb: 0.0722,
    red: { x: 0.640, y: 0.330 },
    green: { x: 0.300, y: 0.600 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    sourceTransfer: { kind: 'srgb' },
  },
  'display-p3': {
    id: 'display-p3',
    label: 'Display P3',
    kr: 0.2290,
    kg: 0.6917,
    kb: 0.0793,
    red: { x: 0.680, y: 0.320 },
    green: { x: 0.265, y: 0.690 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    sourceTransfer: { kind: 'srgb' },
  },
  'adobe-rgb': {
    id: 'adobe-rgb',
    label: 'Adobe RGB (1998)',
    kr: 0.2974,
    kg: 0.6274,
    kb: 0.0752,
    red: { x: 0.640, y: 0.330 },
    green: { x: 0.210, y: 0.710 },
    blue: { x: 0.150, y: 0.060 },
    white: { x: 0.3127, y: 0.3290 },
    sourceTransfer: { kind: 'gamma', gamma: ADOBE_RGB_GAMMA },
  },
};

export function normalizeVirtualGamutId(value: unknown, fallback: VirtualGamutId = 'srgb'): VirtualGamutId {
  return value === 'srgb' || value === 'display-p3' || value === 'adobe-rgb'
    ? value
    : fallback;
}

export function getVirtualGamutPreset(value: unknown): VirtualGamutPreset {
  return VIRTUAL_GAMUT_PRESETS[normalizeVirtualGamutId(value)];
}
