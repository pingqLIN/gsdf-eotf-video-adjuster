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
  assert.match(panelSource, /GSDF-QC 全域測試圖/);
  assert.match(panelSource, /FullDiagnosticPattern/);
  assert.match(panelSource, /InspectionModeView/);
  assert.match(panelSource, /InspectionModeHeader/);
  assert.match(panelSource, /InspectionMode = 'pattern' \| 'chart' \| null/);
  assert.match(panelSource, /inspectionMode \?/);
  assert.match(panelSource, /setInspectionMode\('pattern'\)/);
  assert.match(panelSource, /setInspectionMode\('chart'\)/);
  assert.match(panelSource, /setInspectionMode\(null\)/);
  assert.match(panelSource, /drawDiagnosticPattern/);
  assert.match(panelSource, /drawLinePairBand/);
  assert.match(panelSource, /drawVerticalGradient/);
  assert.match(panelSource, /drawContinuousSweepCell/);
  assert.match(panelSource, /line-pair and gradient pattern/);
  assert.match(panelSource, /Grid3X3/);
  assert.match(panelSource, /GSDF_PATTERN_VIEW_CHANGED/);
  assert.match(panelSource, /PANEL_THEME_STORAGE_KEY/);
  assert.match(panelSource, /theme-\$\{panelTheme\}/);
  assert.match(panelSource, /切換到明亮面板/);
  assert.match(panelSource, /關閉面板/);
  assert.match(panelSource, /Filter 總量/);
  assert.match(panelSource, /Gamma 補償/);
  assert.match(panelSource, /gammaTarget/);
  assert.match(panelSource, /gammaCorrectionToTarget/);
  assert.match(panelSource, /gammaTargetToCorrection/);
  assert.match(panelSource, /DEFAULT_GAMMA_TARGET/);
  assert.match(panelSource, /色彩模型/);
  assert.match(panelSource, /YCbCr/);
  assert.match(panelSource, /完整圖表/);
  assert.match(panelSource, /即時對比度分析視圖/);
  assert.match(panelSource, /EffectSwitch/);
  assert.match(panelSource, /role="switch"/);
  assert.match(panelSource, /aria-checked=\{enabled\}/);
  assert.match(panelSource, /啟動 EOTF 修正/);
  assert.match(panelSource, /效果應用/);
  assert.match(panelSource, /title="關閉"/);
  assert.match(panelSource, /hidden=\{activeTab !== 'basic'\}/);
  assert.match(panelSource, /hidden=\{activeTab !== 'advanced'\}/);
  assert.match(panelSource, /DEFAULT_TARGET_LUMINANCE_NITS/);
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
  assert.doesNotMatch(panelSource, /Math\.round\(\(viewport\.width - width\) \/ 2\)/);
  assert.doesNotMatch(panelSource, /FloatingOverlayWindow/);

  const basicIndex = panelSource.indexOf("activeTab !== 'basic'");
  const advancedIndex = panelSource.indexOf("activeTab !== 'advanced'");
  assert.ok(basicIndex >= 0 && advancedIndex > basicIndex);
});

test('inspection modes use an inset hairline frame and lighter UI typography', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(cssSource, /\.gsdf-inspection-mode::after/);
  assert.match(cssSource, /\.gsdf-inspection-header/);
  assert.match(cssSource, /inset: 2px/);
  assert.match(cssSource, /border: 1px solid rgba\(255, 255, 255, 0\.72\)/);
  assert.match(cssSource, /pointer-events: none/);
  assert.match(cssSource, /border-color: rgba\(148, 163, 184, 0\.09\)/);
  assert.match(cssSource, /font-weight: 500 !important/);
  assert.match(cssSource, /font-weight: 520/);
  assert.doesNotMatch(cssSource, /font-weight: 650/);
  assert.doesNotMatch(cssSource, /gsdf-floating-window/);
});

test('header drag handling does not intercept interactive controls', () => {
  assert.match(panelSource, /function isInteractiveDragTarget/);
  assert.match(panelSource, /button, input, label, select, textarea, a/);
  assert.match(panelSource, /data-no-drag/);
  assert.match(panelSource, /isInteractiveDragTarget\(e\.target\)/);
  assert.match(panelSource, /onExtensionDrag\?\.\(deltaX, deltaY\)/);
  assert.match(appSource, /type: 'GSDF_CLOSE_PANEL'/);
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
  assert.match(panelSource, /drawContinuousSweepCell/);
  assert.match(panelSource, /compactStripeWidth = 18/);
  assert.match(panelSource, /h-6/);
  assert.match(panelSource, /modulationPeriods = \[18, 12, 6, 4\]/);
  assert.match(panelSource, /rowCount = 18/);
  assert.match(typesSource, /const transferTable = buildGsdfTableValues\(normalized\)/);
  assert.match(typesSource, /getGammaAdjustedInputLevel/);
  assert.match(typesSource, /gammaLevel = getGammaAdjustedInputLevel\(inputLevel, normalized\.gammaTarget\)/);
  assert.match(typesSource, /gammaCorrectionToTarget/);
  assert.match(typesSource, /gammaTargetToCorrection/);
  assert.match(typesSource, /sampleTableValue\(transferTable, baseRatio\)/);
  assert.match(typesSource, /sampleTableValue\(transferTable, nextRatio\)/);
  assert.match(typesSource, /export function buildGsdfCalibrationStripeRows/);
  assert.match(typesSource, /const right = Math\.min\(255, left \+ 2\)/);
});

test('extension panel avoids internal scrollbars in the compact control view', () => {
  assert.match(panelSource, /h-\[720px\]/);
  assert.match(panelSource, /w-\[420px\]/);
  assert.match(panelSource, /overflow-hidden p-4/);
  assert.doesNotMatch(panelSource, /flex-1 space-y-5 overflow-y-auto p-5/);
});

test('settings autosave one second after panel adjustments', () => {
  assert.match(appSource, /window\.setTimeout/);
  assert.match(appSource, /}, 1000\)/);
  assert.match(appSource, /gsdf_extension_settings/);
  assert.match(appSource, /偏好設定已自動儲存/);
  assert.doesNotMatch(appSource, /handleSaveDefault/);
});
