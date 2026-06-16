import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as esbuild from 'esbuild';

async function importBundledModule(relativePath) {
  const result = await esbuild.build({
    entryPoints: [fileURLToPath(new URL(`../${relativePath}`, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  const source = result.outputFiles[0].text;
  const encoded = Buffer.from(source, 'utf8').toString('base64');

  return import(`data:text/javascript;base64,${encoded}`);
}

function makeImageData(width, height, pixelFor) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue] = pixelFor(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

test('luminance estimator computes ROI statistics, clipping, and reference nits', async () => {
  const { analyzeLuminanceFrame, estimateLuminance, srgbToLinear } = await importBundledModule('src/diagnostics/luminanceEstimator.ts');
  const imageData = makeImageData(10, 10, (x, y) => {
    if (x === 0 || y === 0) {
      return [255, 255, 255];
    }
    if (x === 9 || y === 9) {
      return [0, 0, 0];
    }
    return [128, 128, 128];
  });

  const sample = analyzeLuminanceFrame(imageData, { roiRatio: 0.4, timestampMs: 12 });
  const expectedMid = srgbToLinear(128 / 255);

  assert.equal(sample.timestampMs, 12);
  assert.deepEqual(sample.roi, { x: 3, y: 3, width: 4, height: 4 });
  assert.ok(Math.abs(sample.meanY - expectedMid) < 0.0001);
  assert.equal(sample.clipLowRatio, 0);
  assert.equal(sample.clipHighRatio, 0);
  assert.equal(sample.stabilityScore, 1);

  const estimate = estimateLuminance(sample, { referenceNits: 100, referenceSignal: sample.meanY / 2 });
  assert.equal(estimate.confidence, 'medium');
  assert.ok(estimate.estimatedNits > 199 && estimate.estimatedNits < 201);
  assert.equal(estimate.suggestedLmax, 200);
});

test('luminance estimator marks clipped unstable frames as low confidence', async () => {
  const { analyzeLuminanceFrame, estimateLuminance } = await importBundledModule('src/diagnostics/luminanceEstimator.ts');
  const imageData = makeImageData(8, 8, () => [255, 255, 255]);
  const sample = analyzeLuminanceFrame(imageData, { roiRatio: 1 });
  const estimate = estimateLuminance(sample, { referenceNits: 100, referenceSignal: Math.max(0.001, sample.meanY) });

  assert.equal(sample.clipHighRatio, 1);
  assert.equal(estimate.confidence, 'low');
  assert.ok(estimate.warnings.includes('High clipping detected'));
});

test('camera probe helpers tolerate missing browser APIs and stop streams', async () => {
  const previousNavigator = globalThis.navigator;
  const previousImageCapture = globalThis.ImageCapture;
  const { createImageCaptureSnapshot, readCameraCapabilities, requestCameraStream, stopCameraStream } = await importBundledModule('src/diagnostics/cameraProbe.ts');

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'diagnostic-test',
      mediaDevices: undefined,
    },
    configurable: true,
  });
  delete globalThis.ImageCapture;

  await assert.rejects(() => requestCameraStream(), /getUserMedia unavailable/);

  const stopped = [];
  stopCameraStream({
    getTracks: () => [{ stop: () => stopped.push('video') }, { stop: () => stopped.push('audio') }],
  });
  assert.deepEqual(stopped, ['video', 'audio']);

  const snapshot = readCameraCapabilities({
    getCapabilities: () => ({ exposureMode: ['continuous'] }),
    getSettings: () => ({ width: 1280, height: 720 }),
  });
  assert.deepEqual(snapshot.capabilities, { exposureMode: ['continuous'] });
  assert.equal(snapshot.settings.width, 1280);
  assert.ok(snapshot.warnings.includes('Exposure metadata unavailable'));

  const imageCaptureSnapshot = await createImageCaptureSnapshot({});
  assert.ok(imageCaptureSnapshot.warnings.includes('ImageCapture unavailable'));

  Object.defineProperty(globalThis, 'navigator', {
    value: previousNavigator,
    configurable: true,
  });
  if (previousImageCapture) {
    globalThis.ImageCapture = previousImageCapture;
  }
});
