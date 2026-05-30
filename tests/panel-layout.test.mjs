import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panelSource = readFileSync(new URL('../src/components/DraggablePanel.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const videoBackgroundSource = readFileSync(new URL('../src/components/VideoBackground.tsx', import.meta.url), 'utf8');

test('control panel is split into basic and advanced tabs', () => {
  assert.match(panelSource, /activeTab/);
  assert.match(panelSource, /'basic'/);
  assert.match(panelSource, /'advanced'/);
  assert.match(panelSource, /GSDFStripeTest/);
  assert.match(panelSource, /輸出預覽/);
  assert.match(panelSource, /亮度校準/);
  assert.match(panelSource, /完整多頻率條紋圖/);
  assert.match(panelSource, /Grid3X3/);
  assert.match(panelSource, /GSDF_PATTERN_VIEW_CHANGED/);
  assert.match(panelSource, /曲線模式/);
  assert.match(panelSource, /純 GSDF/);
  assert.match(panelSource, /色彩模型/);
  assert.match(panelSource, /YCbCr/);
  assert.match(panelSource, /React\.lazy/);
  assert.match(panelSource, /React\.Suspense/);
  assert.match(panelSource, /import\('\.\/GSDFChart'\)/);
  assert.doesNotMatch(panelSource, /import \{ GSDFChart \} from '\.\/GSDFChart'/);
  assert.doesNotMatch(panelSource, /起始 Gamma/);
  assert.doesNotMatch(panelSource, /inputGamma/);

  const basicIndex = panelSource.indexOf("activeTab === 'basic'");
  const advancedIndex = panelSource.indexOf("activeTab === 'advanced'");
  assert.ok(basicIndex >= 0 && advancedIndex > basicIndex);
});

test('header drag handling does not intercept interactive controls', () => {
  assert.match(panelSource, /function isInteractiveDragTarget/);
  assert.match(panelSource, /button, input, label, select, textarea, a/);
  assert.match(panelSource, /data-no-drag/);
  assert.match(panelSource, /isInteractiveDragTarget\(e\.target\)/);
});

test('standalone video preview uses the shared GSDF table model', () => {
  assert.match(videoBackgroundSource, /buildGsdfTableValues\(settings\)/);
  assert.match(videoBackgroundSource, /tableValues=\{gsdfTableValues\}/);
  assert.match(videoBackgroundSource, /eotf-ycbcr/);
  assert.match(videoBackgroundSource, /settings\.colorModel === 'ycbcr'/);
  assert.doesNotMatch(videoBackgroundSource, /type="gamma"/);
});

test('basic tab stripe test follows the active transfer table', () => {
  assert.match(panelSource, /buildGsdfStripeRows\(settings\)/);
  assert.match(panelSource, /buildGsdfCalibrationStripeRows\(\)/);
  assert.match(panelSource, /renderFrequencyMatrix/);
  assert.match(panelSource, /compactStripeWidth = 14/);
  assert.match(panelSource, /minmax\(72px,1fr\)/);
  assert.match(panelSource, /stripeWidth: 40/);
  assert.match(panelSource, /frequency\.stripeWidth \* 2/);
  assert.match(typesSource, /const transferTable = buildGsdfTableValues\(normalized\)/);
  assert.match(typesSource, /sampleTableValue\(transferTable, baseRatio\)/);
  assert.match(typesSource, /sampleTableValue\(transferTable, nextRatio\)/);
  assert.match(typesSource, /export function buildGsdfCalibrationStripeRows/);
  assert.match(typesSource, /const right = Math\.min\(255, left \+ 2\)/);
});
