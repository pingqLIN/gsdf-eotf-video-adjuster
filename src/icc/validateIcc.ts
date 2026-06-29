import { ICC_D50_XYZ, type XyzNumber } from './matrix';

export interface ParsedIccTag {
  signature: string;
  offset: number;
  size: number;
}

export interface ParsedIccProfile {
  size: number;
  versionMajor: number;
  deviceClass: string;
  colorSpace: string;
  pcs: string;
  tags: ParsedIccTag[];
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  ) >>> 0;
}

function readS15Fixed16(bytes: Uint8Array, offset: number): number {
  const unsigned = readU32(bytes, offset);
  const signed = unsigned > 0x7fffffff ? unsigned - 0x100000000 : unsigned;
  return signed / 65536;
}

export function parseIccProfile(bytes: Uint8Array): ParsedIccProfile {
  if (bytes.length < 132) {
    throw new Error('ICC profile is too small');
  }

  const tagCount = readU32(bytes, 128);
  const tags: ParsedIccTag[] = [];
  for (let index = 0; index < tagCount; index += 1) {
    const entryOffset = 132 + index * 12;
    tags.push({
      signature: readAscii(bytes, entryOffset, 4),
      offset: readU32(bytes, entryOffset + 4),
      size: readU32(bytes, entryOffset + 8),
    });
  }

  return {
    size: readU32(bytes, 0),
    versionMajor: bytes[8],
    deviceClass: readAscii(bytes, 12, 4),
    colorSpace: readAscii(bytes, 16, 4),
    pcs: readAscii(bytes, 20, 4),
    tags,
  };
}

function getTag(parsed: ParsedIccProfile, signature: string): ParsedIccTag | undefined {
  return parsed.tags.find((tag) => tag.signature === signature);
}

export function readCurveTag(bytes: Uint8Array, tag: ParsedIccTag): number[] {
  if (readAscii(bytes, tag.offset, 4) !== 'curv') {
    throw new Error(`${tag.signature} is not a curveType tag`);
  }

  const count = readU32(bytes, tag.offset + 8);
  return Array.from({ length: count }, (_, index) => readU16(bytes, tag.offset + 12 + index * 2) / 65535);
}

export function readXyzTag(bytes: Uint8Array, tag: ParsedIccTag): XyzNumber {
  if (readAscii(bytes, tag.offset, 4) !== 'XYZ ') {
    throw new Error(`${tag.signature} is not an XYZType tag`);
  }

  return {
    x: readS15Fixed16(bytes, tag.offset + 8),
    y: readS15Fixed16(bytes, tag.offset + 12),
    z: readS15Fixed16(bytes, tag.offset + 16),
  };
}

export function readTextDescriptionTag(bytes: Uint8Array, tag: ParsedIccTag): string {
  if (readAscii(bytes, tag.offset, 4) !== 'desc') {
    throw new Error(`${tag.signature} is not a textDescriptionType tag`);
  }

  const asciiCount = readU32(bytes, tag.offset + 8);
  return readAscii(bytes, tag.offset + 12, Math.max(0, asciiCount - 1));
}

function isMonotonic(values: readonly number[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] < values[index - 1]) {
      return false;
    }
  }

  return true;
}

function isNonZeroXyz(value: XyzNumber): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z) &&
    Math.abs(value.x) + Math.abs(value.y) + Math.abs(value.z) > 0.0001;
}

export function validateVirtualDisplayIcc(bytes: Uint8Array, expectedTrcSampleCount?: number): string[] {
  const errors: string[] = [];
  let parsed: ParsedIccProfile;

  try {
    parsed = parseIccProfile(bytes);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  if (parsed.size !== bytes.length) {
    errors.push(`Header size ${parsed.size} does not match byte length ${bytes.length}`);
  }
  if (readAscii(bytes, 36, 4) !== 'acsp') {
    errors.push('Missing acsp profile signature');
  }
  if (parsed.deviceClass !== 'mntr') {
    errors.push(`Expected mntr profile class, got ${parsed.deviceClass}`);
  }
  if (parsed.colorSpace !== 'RGB ') {
    errors.push(`Expected RGB color space, got ${parsed.colorSpace}`);
  }
  if (parsed.pcs !== 'XYZ ') {
    errors.push(`Expected XYZ PCS, got ${parsed.pcs}`);
  }

  const requiredTags = ['desc', 'cprt', 'wtpt', 'rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'];
  for (const signature of requiredTags) {
    if (!getTag(parsed, signature)) {
      errors.push(`Missing ${signature} tag`);
    }
  }

  for (const tag of parsed.tags) {
    if (tag.offset % 4 !== 0) {
      errors.push(`${tag.signature} offset is not 4-byte aligned`);
    }
    if (tag.offset + tag.size > bytes.length) {
      errors.push(`${tag.signature} points outside profile bytes`);
    }
  }

  for (const signature of ['rTRC', 'gTRC', 'bTRC']) {
    const tag = getTag(parsed, signature);
    if (!tag) {
      continue;
    }

    try {
      const values = readCurveTag(bytes, tag);
      if (expectedTrcSampleCount !== undefined && values.length !== expectedTrcSampleCount) {
        errors.push(`${signature} sample count ${values.length} does not match ${expectedTrcSampleCount}`);
      }
      if (!isMonotonic(values)) {
        errors.push(`${signature} is not monotonic`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const signature of ['wtpt', 'rXYZ', 'gXYZ', 'bXYZ']) {
    const tag = getTag(parsed, signature);
    if (!tag) {
      continue;
    }

    try {
      const xyz = readXyzTag(bytes, tag);
      if (!isNonZeroXyz(xyz)) {
        errors.push(`${signature} XYZ values are not finite non-zero numbers`);
      }
      if (signature === 'wtpt' && (
        Math.abs(xyz.x - ICC_D50_XYZ.x) > 0.002 ||
        Math.abs(xyz.y - ICC_D50_XYZ.y) > 0.002 ||
        Math.abs(xyz.z - ICC_D50_XYZ.z) > 0.002
      )) {
        errors.push('wtpt is not ICC D50');
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return errors;
}
