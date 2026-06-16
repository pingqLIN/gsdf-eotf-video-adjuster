import type { CameraCapabilitySnapshot } from './measurementTypes';

type MinimalMediaTrackCapabilities = Record<string, unknown>;
type MinimalMediaTrackSettings = MediaTrackSettings & Record<string, unknown>;

interface MinimalImageCapture {
  getPhotoCapabilities: () => Promise<Record<string, unknown>>;
  getPhotoSettings?: () => Promise<Record<string, unknown>>;
}

interface ImageCaptureConstructor {
  new(track: MediaStreamTrack): MinimalImageCapture;
}

export interface CameraProbeRequestOptions {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
}

export async function requestCameraStream(options: CameraProbeRequestOptions = {}): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('mediaDevices.getUserMedia unavailable');
  }

  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: options.facingMode ?? 'environment' },
      width: { ideal: options.width ?? 1280 },
      height: { ideal: options.height ?? 720 },
    },
    audio: false,
  });
}

export function stopCameraStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export function readCameraCapabilities(track: MediaStreamTrack): Pick<CameraCapabilitySnapshot, 'capabilities' | 'settings' | 'warnings'> {
  const warnings: string[] = [];
  let capabilities: MinimalMediaTrackCapabilities = {};
  let settings: MinimalMediaTrackSettings = {};

  try {
    capabilities = typeof track.getCapabilities === 'function'
      ? track.getCapabilities() as MinimalMediaTrackCapabilities
      : {};
  } catch (error) {
    warnings.push(`getCapabilities failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  try {
    settings = typeof track.getSettings === 'function'
      ? track.getSettings() as MinimalMediaTrackSettings
      : {};
  } catch (error) {
    warnings.push(`getSettings failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (!('iso' in settings) && !('exposureTime' in settings) && !('exposureCompensation' in settings)) {
    warnings.push('Exposure metadata unavailable');
  }

  return { capabilities, settings, warnings };
}

export async function createImageCaptureSnapshot(track: MediaStreamTrack): Promise<Pick<CameraCapabilitySnapshot, 'photoCapabilities' | 'photoSettings' | 'warnings'>> {
  const warnings: string[] = [];
  const ImageCaptureApi = (globalThis as typeof globalThis & { ImageCapture?: ImageCaptureConstructor }).ImageCapture;

  if (!ImageCaptureApi) {
    return {
      warnings: ['ImageCapture unavailable'],
    };
  }

  let capture: MinimalImageCapture;
  try {
    capture = new ImageCaptureApi(track);
  } catch (error) {
    return {
      warnings: [`ImageCapture construction failed: ${error instanceof Error ? error.message : 'unknown error'}`],
    };
  }

  let photoCapabilities: Record<string, unknown> | undefined;
  let photoSettings: Record<string, unknown> | undefined;

  try {
    photoCapabilities = await capture.getPhotoCapabilities();
  } catch (error) {
    warnings.push(`getPhotoCapabilities failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (typeof capture.getPhotoSettings === 'function') {
    try {
      photoSettings = await capture.getPhotoSettings();
    } catch (error) {
      warnings.push(`getPhotoSettings failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  } else {
    warnings.push('getPhotoSettings unavailable');
  }

  return { photoCapabilities, photoSettings, warnings };
}

export async function createCameraCapabilitySnapshot(track: MediaStreamTrack): Promise<CameraCapabilitySnapshot> {
  const cameraSnapshot = readCameraCapabilities(track);
  const photoSnapshot = await createImageCaptureSnapshot(track);

  return {
    userAgent: navigator.userAgent,
    capabilities: cameraSnapshot.capabilities,
    settings: cameraSnapshot.settings,
    photoCapabilities: photoSnapshot.photoCapabilities,
    photoSettings: photoSnapshot.photoSettings,
    warnings: [...cameraSnapshot.warnings, ...photoSnapshot.warnings],
  };
}
