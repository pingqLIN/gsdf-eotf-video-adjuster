import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panelSource = readFileSync(new URL('../src/components/DraggablePanel.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
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
  assert.match(panelSource, /Filter 總量/);
  assert.match(panelSource, /色彩模型/);
  assert.match(panelSource, /YCbCr/);
  assert.match(panelSource, /完整圖表/);
  assert.match(panelSource, /完整 GSDF transfer curve/);
  assert.match(panelSource, /圖說/);
  assert.match(panelSource, /h-\[420px\]/);
  assert.match(panelSource, /DEFAULT_TARGET_LUMINANCE_NITS/);
  assert.match(panelSource, /不使用特定亮度中性點/);
  assert.match(panelSource, /完整 GSDF table 先算出來/);
  assert.match(panelSource, /React\.lazy/);
  assert.match(panelSource, /React\.Suspense/);
  assert.match(panelSource, /import\('\.\/GSDFChart'\)/);
  assert.match(panelSource, /disabled=\{disabled\}/);
  assert.match(panelSource, /aria-disabled=\{disabled\}/);
  assert.doesNotMatch(panelSource, /import \{ GSDFChart \} from '\.\/GSDFChart'/);
  assert.doesNotMatch(panelSource, /純 GSDF/);
  assert.doesNotMatch(panelSource, /曲線模式/);
  assert.doesNotMatch(panelSource, /onSaveDefault/);
  assert.doesNotMatch(panelSource, /儲存預設偏好設定/);
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

test('analysis chart resizes with the control panel', () => {
  const chartSource = readFileSync(new URL('../src/components/GSDFChart.tsx', import.meta.url), 'utf8');

  assert.match(chartSource, /ResizeObserver/);
  assert.match(chartSource, /chartSize\.width/);
  assert.match(chartSource, /className = 'h-48'/);
  assert.doesNotMatch(chartSource, /width=\{291\}/);
});

test('basic tab stripe test follows the active transfer table', () => {
  assert.match(panelSource, /buildGsdfStripeRows\(settings\)/);
  assert.match(panelSource, /buildGsdfCalibrationStripeRows\(\)/);
  assert.match(panelSource, /renderFrequencyMatrix/);
  assert.match(panelSource, /compactStripeWidth = 18/);
  assert.match(panelSource, /h-7/);
  assert.match(panelSource, /minmax\(72px,1fr\)/);
  assert.match(panelSource, /stripeWidth: 40/);
  assert.match(panelSource, /frequency\.stripeWidth \* 2/);
  assert.match(typesSource, /const transferTable = buildGsdfTableValues\(normalized\)/);
  assert.match(typesSource, /sampleTableValue\(transferTable, baseRatio\)/);
  assert.match(typesSource, /sampleTableValue\(transferTable, nextRatio\)/);
  assert.match(typesSource, /export function buildGsdfCalibrationStripeRows/);
  assert.match(typesSource, /const right = Math\.min\(255, left \+ 2\)/);
});

test('extension panel avoids internal scrollbars in the compact control view', () => {
  assert.match(panelSource, /h-\[680px\]/);
  assert.match(panelSource, /overflow-hidden p-5/);
  assert.doesNotMatch(panelSource, /flex-1 space-y-5 overflow-y-auto p-5/);
});

test('settings autosave one second after panel adjustments', () => {
  assert.match(appSource, /window\.setTimeout/);
  assert.match(appSource, /}, 1000\)/);
  assert.match(appSource, /gsdf_extension_settings/);
  assert.match(appSource, /偏好設定已自動儲存/);
  assert.doesNotMatch(appSource, /handleSaveDefault/);
});
