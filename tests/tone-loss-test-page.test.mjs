import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const toneLossSource = readFileSync(new URL('../src/components/ToneLossTestPage.tsx', import.meta.url), 'utf8');

test('tone loss checker is available as a standalone video pattern route', () => {
  assert.match(appSource, /ToneLossTestPage/);
  assert.match(appSource, /window\.location\.pathname === '\/tone-loss-test'/);
  assert.match(appSource, /mode=tone-loss-test/);
  assert.match(appSource, /return <ToneLossTestPage \/>/);
});

test('tone loss checker covers 8-bit shadow and highlight code values for neutral RGB and CMY patches', () => {
  assert.match(toneLossSource, /TONE_LEVEL_COUNT/);
  assert.match(toneLossSource, /8-bit Tone Loss Video Pattern/);
  assert.match(toneLossSource, /SHADOW 8-bit code values/);
  assert.match(toneLossSource, /HIGHLIGHT 8-bit code values/);
  assert.match(toneLossSource, /W\/K neutral/);
  assert.match(toneLossSource, /Red primary/);
  assert.match(toneLossSource, /Green primary/);
  assert.match(toneLossSource, /Blue primary/);
  assert.match(toneLossSource, /Cyan complement/);
  assert.match(toneLossSource, /Magenta complement/);
  assert.match(toneLossSource, /Yellow complement/);
  assert.match(toneLossSource, /lowLevels/);
  assert.match(toneLossSource, /highLevels/);
  assert.match(toneLossSource, /requestAnimationFrame/);
  assert.match(toneLossSource, /<canvas/);
  assert.match(toneLossSource, /canvas\.captureStream\(60\)/);
  assert.match(toneLossSource, /video\.srcObject = stream/);
  assert.match(toneLossSource, /<video/);
  assert.match(toneLossSource, /HTML video element fed by canvas captureStream/);
  assert.match(toneLossSource, /streamExpanded/);
  assert.match(toneLossSource, /放大 stream/);
  assert.match(toneLossSource, /縮小 stream/);
  assert.match(toneLossSource, /data-stream-expanded/);
});
