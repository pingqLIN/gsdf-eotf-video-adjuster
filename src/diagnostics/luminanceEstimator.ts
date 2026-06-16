import type {
  ExposureMetadata,
  LuminanceEstimate,
  LuminanceFrameSample,
  LuminanceReference,
  LuminanceRoi,
} from './measurementTypes';

export interface AnalyzeFrameOptions {
  roiRatio?: number;
  previousSample?: LuminanceFrameSample | null;
  exposure?: ExposureMetadata;
  timestampMs?: number;
}

export function srgbToLinear(encoded: number): number {
  const value = Math.max(0, Math.min(1, encoded));
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function createCenteredRoi(width: number, height: number, ratio = 0.4): LuminanceRoi {
  const clampedRatio = Math.max(0.05, Math.min(1, ratio));
  const roiWidth = Math.max(1, Math.round(width * clampedRatio));
  const roiHeight = Math.max(1, Math.round(height * clampedRatio));

  return {
    x: Math.max(0, Math.round((width - roiWidth) / 2)),
    y: Math.max(0, Math.round((height - roiHeight) / 2)),
    width: roiWidth,
    height: roiHeight,
  };
}

function quantile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * ratio)));
  return sorted[index] ?? 0;
}

function exposureFactor(exposure?: ExposureMetadata): number | null {
  if (!exposure?.iso || !exposure.exposureTime) {
    return null;
  }

  return exposure.exposureTime * exposure.iso * Math.pow(2, exposure.exposureCompensation ?? 0);
}

export function analyzeLuminanceFrame(imageData: ImageData, options: AnalyzeFrameOptions = {}): LuminanceFrameSample {
  const roi = createCenteredRoi(imageData.width, imageData.height, options.roiRatio ?? 0.4);
  const values: number[] = [];
  let sum = 0;
  let clipLowCount = 0;
  let clipHighCount = 0;

  for (let y = roi.y; y < roi.y + roi.height; y += 1) {
    for (let x = roi.x; x < roi.x + roi.width; x += 1) {
      const offset = (y * imageData.width + x) * 4;
      const red = imageData.data[offset] ?? 0;
      const green = imageData.data[offset + 1] ?? 0;
      const blue = imageData.data[offset + 2] ?? 0;
      const encodedY = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const linearY = srgbToLinear(encodedY);

      values.push(linearY);
      sum += linearY;

      if (encodedY <= 2 / 255) {
        clipLowCount += 1;
      }
      if (encodedY >= 253 / 255) {
        clipHighCount += 1;
      }
    }
  }

  values.sort((left, right) => left - right);

  const pixelCount = Math.max(1, values.length);
  const meanY = sum / pixelCount;
  const previousMean = options.previousSample?.meanY ?? meanY;
  const frameDelta = Math.abs(meanY - previousMean);
  const clippingPenalty = Math.max(clipLowCount, clipHighCount) / pixelCount;
  const stabilityScore = Math.max(0, Math.min(1, 1 - frameDelta * 8 - clippingPenalty * 0.75));

  return {
    timestampMs: options.timestampMs ?? performance.now(),
    roi,
    meanY,
    medianY: quantile(values, 0.5),
    p05Y: quantile(values, 0.05),
    p95Y: quantile(values, 0.95),
    clipLowRatio: clipLowCount / pixelCount,
    clipHighRatio: clipHighCount / pixelCount,
    frameDelta,
    stabilityScore,
    exposure: options.exposure,
  };
}

export function estimateLuminance(
  sample: LuminanceFrameSample | null,
  reference?: LuminanceReference | null,
): LuminanceEstimate {
  const warnings: string[] = [];

  if (!sample) {
    return {
      source: 'web-camera',
      confidence: 'low',
      relativeIndex: 0,
      warnings: ['No frame sample captured'],
    };
  }

  const exposure = exposureFactor(sample.exposure);
  const exposureNormalizedSignal = exposure && exposure > 0
    ? sample.meanY / exposure
    : undefined;
  const relativeIndex = Math.max(0, sample.meanY);
  const clipped = sample.clipLowRatio > 0.02 || sample.clipHighRatio > 0.02;

  if (!exposureNormalizedSignal) {
    warnings.push('Exposure metadata unavailable; using histogram-only rough meter');
  }
  if (sample.stabilityScore < 0.75) {
    warnings.push('Frame signal is not stable enough for a high-confidence estimate');
  }
  if (sample.clipHighRatio > 0.02) {
    warnings.push('High clipping detected');
  }
  if (sample.clipLowRatio > 0.02) {
    warnings.push('Low clipping detected');
  }

  const canUseReference = reference?.referenceNits && reference.referenceSignal > 0;
  const estimatedNits = canUseReference
    ? (relativeIndex / reference.referenceSignal) * reference.referenceNits
    : undefined;
  const suggestedLmax = estimatedNits
    ? Math.max(10, Math.min(500, Number(estimatedNits.toFixed(estimatedNits < 100 ? 1 : 0))))
    : undefined;

  if (!estimatedNits) {
    warnings.push('Manual reference required for estimated nits');
  }

  return {
    source: 'web-camera',
    confidence: estimatedNits && sample.stabilityScore >= 0.75 && !clipped ? 'medium' : 'low',
    relativeIndex,
    estimatedNits,
    referenceNits: reference?.referenceNits,
    suggestedLmax,
    exposureNormalizedSignal,
    warnings,
  };
}
