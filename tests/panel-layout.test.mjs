import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panelSource = readFileSync(new URL('../src/components/DraggablePanel.tsx', import.meta.url), 'utf8');
const chartSource = readFileSync(new URL('../src/components/GSDFChart.tsx', import.meta.url), 'utf8');

test('control panel is split into basic and advanced tabs', () => {
  assert.match(panelSource, /activeTab/);
  assert.match(panelSource, /'basic'/);
  assert.match(panelSource, /'advanced'/);
  assert.match(panelSource, /GSDFStripeTest/);
  assert.match(panelSource, /NumberControl/);
  assert.match(panelSource, /起始 Gamma/);
  assert.match(panelSource, /INPUT_GAMMA_MIN/);
  assert.match(panelSource, /INPUT_GAMMA_MAX/);
  assert.match(panelSource, /inputGamma=\{settings\.inputGamma\}/);
  assert.match(chartSource, /inputGamma: number/);
  assert.match(chartSource, /buildGsdfTableValues\(\{ enabled, lmax, strength, inputGamma \}\)/);

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
