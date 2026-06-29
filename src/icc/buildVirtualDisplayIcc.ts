import { buildToneCurveSnapshot, type IccProfileIntent, type ToneCurveSettings, type ToneCurveSnapshot } from '../color/buildToneCurveSnapshot';
import { clamp01 } from '../color/curveMath';
import { type DisplayDevicePreset, type DisplayPresetInput, resolveDisplayPreset } from '../color/displayPresets';
import { getVirtualGamutPreset } from '../color/gamutPresets';
import { BinaryWriter } from './binaryWriter';
import { adaptMatrixToD50 } from './chromaticAdaptation';
import { buildRgbToXyzD65Matrix, ICC_D50_XYZ, matrixColumnsToXyz, type Matrix3, type XyzNumber } from './matrix';

export interface IccGenerationOptions {
  profileVersion?: 'v2';
  profileIntent?: IccProfileIntent;
  trcSampleCount?: 4096 | 8192 | 16384;
  displayPreset?: DisplayPresetInput | DisplayDevicePreset;
  description?: string;
  copyright?: string;
  createdAt?: Date;
}

export interface VirtualDisplayIccResult {
  bytes: Uint8Array;
  snapshot: ToneCurveSnapshot;
  fileName: string;
  description: string;
}

const DEFAULT_TRC_SAMPLE_COUNT = 8192;

function normalizeTrcSampleCount(value: unknown): 4096 | 8192 | 16384 {
  return value === 4096 || value === 16384 ? value : DEFAULT_TRC_SAMPLE_COUNT;
}

function writeDateTime(writer: BinaryWriter, date: Date): void {
  writer.u16(date.getUTCFullYear());
  writer.u16(date.getUTCMonth() + 1);
  writer.u16(date.getUTCDate());
  writer.u16(date.getUTCHours());
  writer.u16(date.getUTCMinutes());
  writer.u16(date.getUTCSeconds());
}

function writeXyzNumber(writer: BinaryWriter, value: XyzNumber): void {
  writer.s15Fixed16(value.x);
  writer.s15Fixed16(value.y);
  writer.s15Fixed16(value.z);
}

function buildXyzTag(value: XyzNumber): Uint8Array {
  const writer = new BinaryWriter();
  writer.ascii('XYZ ', 4);
  writer.u32(0);
  writeXyzNumber(writer, value);
  return writer.toUint8Array();
}

function buildCurveTag(values: readonly number[]): Uint8Array {
  const writer = new BinaryWriter();
  writer.ascii('curv', 4);
  writer.u32(0);
  writer.u32(values.length);

  for (const value of values) {
    writer.u16(Math.round(clamp01(value) * 65535));
  }

  return writer.toUint8Array();
}

function buildTextTag(text: string): Uint8Array {
  const writer = new BinaryWriter();
  writer.ascii('text', 4);
  writer.u32(0);
  writer.ascii(`${text}\0`);
  writer.pad4();
  return writer.toUint8Array();
}

function buildTextDescriptionTag(text: string): Uint8Array {
  const writer = new BinaryWriter();
  const asciiText = `${text}\0`;
  writer.ascii('desc', 4);
  writer.u32(0);
  writer.u32(asciiText.length);
  writer.ascii(asciiText);
  writer.u32(0);
  writer.u32(0);
  writer.u16(0);
  for (let index = 0; index < 67; index += 1) {
    writer.u8(0);
  }
  writer.pad4();
  return writer.toUint8Array();
}

function buildS15Fixed16ArrayTag(matrix: Matrix3): Uint8Array {
  const writer = new BinaryWriter();
  writer.ascii('sf32', 4);
  writer.u32(0);
  for (const row of matrix) {
    for (const value of row) {
      writer.s15Fixed16(value);
    }
  }
  return writer.toUint8Array();
}

function buildIccProfileDescription(snapshot: ToneCurveSnapshot): string {
  const metadata = snapshot.metadata;
  return [
    'LumaLift',
    metadata.transferFormula.toUpperCase(),
    metadata.profileIntent,
    metadata.displayGamut,
    metadata.displayPresetId,
    `L${metadata.targetLuminanceNits}`,
    `B${metadata.displayBlackNits.toFixed(metadata.displayBlackNits < 0.01 ? 4 : 3)}`,
    `G${metadata.displayGamma}`,
    `S${metadata.strength}`,
  ].join(' ');
}

function sanitizeNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9.]+/g, '').slice(0, 48);
}

export function buildIccProfileFileName(snapshot: ToneCurveSnapshot): string {
  const metadata = snapshot.metadata;
  return [
    'LumaLift',
    metadata.transferFormula.toUpperCase(),
    metadata.profileIntent,
    sanitizeNamePart(metadata.displayGamut),
    sanitizeNamePart(String(metadata.displayPresetId)),
    `L${Math.round(metadata.targetLuminanceNits)}`,
    `B${metadata.displayBlackNits.toFixed(metadata.displayBlackNits < 0.01 ? 4 : 3)}`,
    `G${metadata.displayGamma}`,
    `S${Math.round(metadata.strength)}`,
  ].join('_') + '.icc';
}

function writeHeader(writer: BinaryWriter, createdAt: Date): void {
  writer.u32(0);
  writer.ascii('LLFT', 4);
  writer.u32(0x02100000);
  writer.ascii('mntr', 4);
  writer.ascii('RGB ', 4);
  writer.ascii('XYZ ', 4);
  writeDateTime(writer, createdAt);
  writer.ascii('acsp', 4);
  writer.ascii('MSFT', 4);
  writer.u32(0);
  writer.ascii('LLFT', 4);
  writer.u32(0);
  writer.u32(0);
  writer.u32(0);
  writer.u32(1);
  writeXyzNumber(writer, ICC_D50_XYZ);
  writer.ascii('LLFT', 4);

  while (writer.offset < 128) {
    writer.u8(0);
  }
}

function assembleProfile(tags: Array<{ signature: string; data: Uint8Array }>, createdAt: Date): Uint8Array {
  const writer = new BinaryWriter();
  writeHeader(writer, createdAt);
  writer.u32(tags.length);

  const tableOffset = writer.offset;
  for (const tag of tags) {
    writer.ascii(tag.signature, 4);
    writer.u32(0);
    writer.u32(0);
  }

  tags.forEach((tag, index) => {
    writer.pad4();
    const offset = writer.offset;
    writer.bytesOf(tag.data);
    writer.pad4();
    writer.patchU32(tableOffset + index * 12 + 4, offset);
    writer.patchU32(tableOffset + index * 12 + 8, tag.data.length);
  });

  writer.patchU32(0, writer.offset);
  return writer.toUint8Array();
}

export function buildVirtualDisplayIcc(
  settings: Partial<ToneCurveSettings>,
  options: IccGenerationOptions = {},
): VirtualDisplayIccResult {
  const profileIntent = options.profileIntent ?? 'compensation';
  const trcSampleCount = normalizeTrcSampleCount(options.trcSampleCount);
  const displayPreset = resolveDisplayPreset(options.displayPreset);
  const snapshot = buildToneCurveSnapshot(settings, {
    tableSize: trcSampleCount,
    profileIntent,
    displayPreset,
    digits: 8,
  });
  const gamut = getVirtualGamutPreset(snapshot.metadata.displayGamut);
  const rgbToXyzD65 = buildRgbToXyzD65Matrix(gamut);
  const { matrix: rgbToXyzD50, adaptationMatrix } = adaptMatrixToD50(rgbToXyzD65);
  const [redXyz, greenXyz, blueXyz] = matrixColumnsToXyz(rgbToXyzD50);
  const description = options.description ?? buildIccProfileDescription(snapshot);
  const curveTag = buildCurveTag(snapshot.iccTrcNorm);
  const tags = [
    { signature: 'desc', data: buildTextDescriptionTag(description) },
    { signature: 'cprt', data: buildTextTag(options.copyright ?? 'Generated by LumaLift') },
    { signature: 'wtpt', data: buildXyzTag(ICC_D50_XYZ) },
    { signature: 'rXYZ', data: buildXyzTag(redXyz) },
    { signature: 'gXYZ', data: buildXyzTag(greenXyz) },
    { signature: 'bXYZ', data: buildXyzTag(blueXyz) },
    { signature: 'rTRC', data: curveTag },
    { signature: 'gTRC', data: curveTag },
    { signature: 'bTRC', data: curveTag },
    { signature: 'chad', data: buildS15Fixed16ArrayTag(adaptationMatrix) },
  ];
  const bytes = assembleProfile(tags, options.createdAt ?? new Date());

  return {
    bytes,
    snapshot,
    fileName: buildIccProfileFileName(snapshot),
    description,
  };
}
