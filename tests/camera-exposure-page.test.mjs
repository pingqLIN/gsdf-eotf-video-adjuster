import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/components/CameraExposureTestPage.tsx', import.meta.url), 'utf8');

test('standalone camera exposure test page is routed outside the extension target display', () => {
  assert.match(appSource, /camera-exposure-test/);
  assert.match(appSource, /CameraExposureTestPage/);
  assert.match(pageSource, /requestCameraStream/);
  assert.match(pageSource, /createCameraCapabilitySnapshot/);
  assert.match(pageSource, /getSettings\(\)/);
  assert.match(pageSource, /getCapabilities\(\)/);
  assert.match(pageSource, /ImageCapture/);
  assert.match(pageSource, /待測色塊仍應顯示在電腦端 Chrome\/擴充程式畫面上/);
  assert.doesNotMatch(pageSource, /target patch|DiagnosticTargetPatch|desktop:target/);
});
