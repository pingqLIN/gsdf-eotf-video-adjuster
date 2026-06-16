export type MeasurementSource = 'web-camera' | 'i1d3-argyll' | 'manual';
export type MeasurementConfidence = 'low' | 'medium';
export type MeasurementTarget = 'black' | 'white' | 'gray-ramp' | 'ambient' | 'unknown';

export interface CameraCapabilitySnapshot {
  userAgent: string;
  capabilities: Record<string, unknown>;
  settings: Record<string, unknown>;
  photoCapabilities?: Record<string, unknown>;
  photoSettings?: Record<string, unknown>;
  warnings: string[];
}

export interface LuminanceRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExposureMetadata {
  iso?: number;
  exposureTime?: number;
  exposureCompensation?: number;
  exposureMode?: string;
}

export interface LuminanceFrameSample {
  timestampMs: number;
  roi: LuminanceRoi;
  meanY: number;
  medianY: number;
  p05Y: number;
  p95Y: number;
  clipLowRatio: number;
  clipHighRatio: number;
  frameDelta: number;
  stabilityScore: number;
  exposure?: ExposureMetadata;
}

export interface LuminanceReference {
  referenceNits: number;
  referenceSignal: number;
}

export interface LuminanceEstimate {
  source: MeasurementSource;
  confidence: MeasurementConfidence;
  relativeIndex: number;
  estimatedNits?: number;
  referenceNits?: number;
  suggestedLmax?: number;
  exposureNormalizedSignal?: number;
  warnings: string[];
}

export interface MeasurementRun {
  id: string;
  createdAt: string;
  source: MeasurementSource;
  target: MeasurementTarget;
  capabilitySnapshot?: CameraCapabilitySnapshot;
  samples: LuminanceFrameSample[];
  estimate: LuminanceEstimate;
}
