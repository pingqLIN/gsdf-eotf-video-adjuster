import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panelSource = readFileSync(new URL('../src/components/DraggablePanel.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const videoBackgroundSource = readFileSync(new URL('../src/components/VideoBackground.tsx', import.meta.url), 'utf8');
const diagnosticProbeSource = readFileSync(new URL('../src/components/DiagnosticCameraProbe.tsx', import.meta.url), 'utf8');
const cameraProbeSource = readFileSync(new URL('../src/diagnostics/cameraProbe.ts', import.meta.url), 'utf8');
const luminanceEstimatorSource = readFileSync(new URL('../src/diagnostics/luminanceEstimator.ts', import.meta.url), 'utf8');
const i18nIndexSource = readFileSync(new URL('../src/i18n/index.ts', import.meta.url), 'utf8');
const i18nMessagesSource = readFileSync(new URL('../src/i18n/messages.ts', import.meta.url), 'utf8');
const i18nLocalesSource = readFileSync(new URL('../src/i18n/locales.ts', import.meta.url), 'utf8');
const designSource = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
const designZhTwSource = readFileSync(new URL('../DESIGN.zh-tw.md', import.meta.url), 'utf8');

test('control panel uses Basic Advanced Diagnostic tabs instead of A B C modes', () => {
  assert.match(panelSource, /type PanelTab = 'basic' \| 'advanced' \| 'diagnostic'/);
  assert.match(panelSource, /\(\['basic', 'advanced', 'diagnostic'\] as PanelTab\[\]\)/);
  assert.match(panelSource, /messages\.panel\.diagnosticTab/);
  assert.match(panelSource, /messages\.panel\.switchToDiagnostic/);
  assert.match(panelSource, /renderDiagnosticPlaceholder/);
  assert.match(panelSource, /DiagnosticCameraProbe settings=\{settings\} setSettings=\{setSettings\} messages=\{messages\}/);
  assert.match(panelSource, /hidden=\{activeTab !== 'basic'\}/);
  assert.match(panelSource, /hidden=\{activeTab !== 'advanced'\}/);
  assert.match(panelSource, /hidden=\{activeTab !== 'diagnostic'\}/);
  assert.match(panelSource, /role="tablist"/);
  assert.match(panelSource, /role="tab"/);
  assert.match(panelSource, /aria-selected=\{selected\}/);

  assert.doesNotMatch(panelSource, /PanelLayoutMode/);
  assert.doesNotMatch(panelSource, /PanelLayoutModeSwitch/);
  assert.doesNotMatch(panelSource, /CenterWorkspaceMode/);
  assert.doesNotMatch(panelSource, /panelMode/);
  assert.doesNotMatch(panelSource, /centerMode/);
  assert.doesNotMatch(panelSource, /GSDF_PANEL_MODE_CHANGED/);
  assert.doesNotMatch(panelSource, /layoutModeA|layoutModeB|layoutModeC/);
});

test('reference pattern and curve open from the right side panel', () => {
  const basicPanelBlock = panelSource.slice(
    panelSource.indexOf('const renderBasicPanel = () =>'),
    panelSource.indexOf('const renderAdvancedPanel = () =>'),
  );
  const diagnosticPanelBlock = panelSource.slice(
    panelSource.indexOf('const renderDiagnosticPlaceholder = () =>'),
    panelSource.indexOf('const handleHeaderPointerDown'),
  );

  assert.match(panelSource, /type SidePanelMode = 'pattern' \| 'chart'/);
  assert.match(panelSource, /sidePanelOpen/);
  assert.match(panelSource, /sidePanelMode/);
  assert.match(panelSource, /ReferenceSidePanel/);
  assert.match(panelSource, /PanelRightOpen/);
  assert.match(panelSource, /PanelRightClose/);
  assert.match(panelSource, /messages\.panel\.toggleSidePanel/);
  assert.match(panelSource, /setSidePanelOpen\(\(value\) => !value\)/);
  assert.match(panelSource, /onModeChange=\{setSidePanelMode\}/);
  assert.match(panelSource, /FullDiagnosticPattern settings=\{settings\} messages=\{messages\}/);
  assert.match(panelSource, /GSDFChart settings=\{settings\} panelTheme=\{panelTheme\}/);
  assert.match(panelSource, /onOpenFull=\{setInspectionMode\}/);
  assert.match(panelSource, /GSDF_PATTERN_VIEW_CHANGED/);
  assert.match(panelSource, /useExpandedOverlayViewport\(inspectionMode !== null \|\| sidePanelOpen\)/);
  assert.match(panelSource, /PANEL_DEFAULT_WIDTH = 400/);
  assert.match(panelSource, /PANEL_DEFAULT_HEIGHT = 680/);
  assert.match(panelSource, /PANEL_SIDE_PANEL_WIDTH = 800/);
  assert.doesNotMatch(basicPanelBlock, /referenceSummaryTitle|referenceSummaryBody/);
  assert.doesNotMatch(basicPanelBlock, /openSidePanel\('pattern'\)|openSidePanel\('chart'\)/);
  assert.doesNotMatch(diagnosticPanelBlock, /openSidePanel\('pattern'\)|openSidePanel\('chart'\)/);
  assert.match(diagnosticPanelBlock, /DiagnosticCameraProbe settings=\{settings\} setSettings=\{setSettings\} messages=\{messages\}/);
  assert.match(diagnosticPanelBlock, /messages\.panel\.referencePanel/);
  assert.match(diagnosticPanelBlock, /messages\.panel\.curvePanel/);
  assert.equal((panelSource.match(/openSidePanel\('pattern'\)|openSidePanel\('chart'\)/g) ?? []).length, 0);
});

test('panel keeps project-owned GSDF pattern and chart logic', () => {
  assert.match(panelSource, /drawDiagnosticPattern/);
  assert.match(panelSource, /drawLinePairBand/);
  assert.match(panelSource, /drawVerticalGradient/);
  assert.match(panelSource, /drawContinuousSweepCell/);
  assert.match(diagnosticProbeSource, /requestCameraStream/);
  assert.match(diagnosticProbeSource, /createCameraCapabilitySnapshot/);
  assert.match(diagnosticProbeSource, /analyzeLuminanceFrame/);
  assert.match(diagnosticProbeSource, /estimateLuminance/);
  assert.match(diagnosticProbeSource, /roughMeterBoundary/);
  assert.match(cameraProbeSource, /getUserMedia/);
  assert.match(cameraProbeSource, /getCapabilities/);
  assert.match(cameraProbeSource, /getPhotoCapabilities/);
  assert.match(luminanceEstimatorSource, /srgbToLinear/);
  assert.match(luminanceEstimatorSource, /clipHighRatio/);
  assert.match(luminanceEstimatorSource, /stabilityScore/);
  assert.match(panelSource, /getRecommendedImageDefaults\(prev\.lmax\)/);
  assert.match(panelSource, /getRecommendedImageDefaults\(nextLmax\)/);
  assert.match(typesSource, /const transferTable = buildGsdfTableValues\(normalized\)/);
  assert.match(typesSource, /sampleTableValue\(transferTable, baseRatio\)/);
  assert.match(typesSource, /gammaCorrectionToTarget/);
  assert.match(typesSource, /gammaTargetToCorrection/);
  assert.match(panelSource, /React\.lazy/);
  assert.match(panelSource, /React\.Suspense/);
  assert.match(panelSource, /import\('\.\/GSDFChart'\)/);
});

test('controls preserve expected interaction and resize affordances', () => {
  assert.match(panelSource, /function isInteractiveDragTarget/);
  assert.match(panelSource, /button, input, label, select, textarea, a/);
  assert.match(panelSource, /data-no-drag/);
  assert.match(panelSource, /EffectSwitch/);
  assert.match(panelSource, /role="switch"/);
  assert.match(panelSource, /aria-checked=\{enabled\}/);
  assert.match(panelSource, /PanelBorderResizeHandles/);
  assert.match(panelSource, /data-resize-handle="e"/);
  assert.match(panelSource, /data-resize-handle="s"/);
  assert.match(panelSource, /data-resize-handle="se"/);
  assert.match(panelSource, /getResizeDeltas/);
  assert.match(appSource, /type: 'GSDF_PANEL_RESIZED'/);
  assert.match(appSource, /type: 'GSDF_CLOSE_PANEL'/);
  assert.match(panelSource, /onExtensionResize\?\.\(deltaWidth, deltaHeight\)/);
});

test('visual language keeps the precision-panel styling hooks', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(cssSource, /\.gsdf-panel-shell/);
  assert.match(cssSource, /\.gsdf-panel-header/);
  assert.match(cssSource, /\.gsdf-control-block/);
  assert.match(cssSource, /\.gsdf-tab-switch/);
  assert.match(cssSource, /\.gsdf-reference-panel/);
  assert.match(cssSource, /\.gsdf-diagnostic-placeholder/);
  assert.match(cssSource, /\.gsdf-camera-probe/);
  assert.match(cssSource, /\.gsdf-camera-preview/);
  assert.match(cssSource, /\.gsdf-range::-webkit-slider-thumb \{\s*width: 12px;\s*height: 18px;/);
  assert.match(cssSource, /touch-action: manipulation/);
  assert.match(cssSource, /touch-action: none/);
  assert.doesNotMatch(cssSource, /gsdf-floating-window/);
});

test('English UI strings do not contain CJK characters', () => {
  const enBlock = i18nMessagesSource.slice(
    i18nMessagesSource.indexOf('export const enMessages = {'),
    i18nMessagesSource.indexOf('export type Messages = typeof enMessages;'),
  );
  const localeNameBlock = i18nMessagesSource.slice(
    i18nMessagesSource.indexOf('export const localeNames'),
    i18nMessagesSource.indexOf('export const enMessages'),
  );

  assert.doesNotMatch(enBlock, /[\u3040-\u30ff\u3400-\u9fff]/);
  assert.doesNotMatch(localeNameBlock, /[\u3040-\u30ff\u3400-\u9fff]/);
  assert.match(i18nMessagesSource, /Traditional Chinese/);
  assert.match(i18nMessagesSource, /Simplified Chinese/);
  assert.match(i18nMessagesSource, /Japanese/);
});

test('design docs describe tabs, camera diagnostics, and side panel rather than obsolete A B C modes', () => {
  assert.match(designSource, /Basic, Advanced, and Diagnostic tabs/);
  assert.match(designSource, /Diagnostic web-camera luminance probe/);
  assert.match(designSource, /rough estimates/);
  assert.match(designSource, /upper-right side-panel control/);
  assert.match(designSource, /side-panel open\/closed states/);
  assert.match(designZhTwSource, /基本、進階、診斷頁籤/);
  assert.match(designZhTwSource, /Web 相機亮度偵測/);
  assert.match(designZhTwSource, /粗略估計/);
  assert.match(designZhTwSource, /右上角側邊欄控制/);
  assert.match(designZhTwSource, /側邊欄開啟\/關閉狀態/);
  assert.doesNotMatch(designSource, /A, B, and C|compact, split, and expanded work modes/);
  assert.doesNotMatch(designZhTwSource, /A、B、C|精簡、左右分欄、完整展開模式/);
});

test('i18n supports system language detection and persisted language preference', () => {
  assert.match(i18nMessagesSource, /supportedLocales = \['en', 'zh-TW', 'zh-CN', 'ja'\]/);
  assert.match(i18nIndexSource, /LANGUAGE_STORAGE_KEY = 'gsdf_language'/);
  assert.match(i18nIndexSource, /navigator\.languages/);
  assert.match(i18nIndexSource, /resolveSystemLocale/);
  assert.match(i18nIndexSource, /zh-hant/);
  assert.match(i18nIndexSource, /zh-hans/);
  assert.match(appSource, /getInitialLocale/);
  assert.match(appSource, /handleLocaleChange/);
  assert.match(panelSource, /LanguageSelector/);
  assert.match(panelSource, /supportedLocales\.map/);
  assert.match(i18nLocalesSource, /export const zhTwMessages: Messages =/);
  assert.match(i18nLocalesSource, /export const zhCnMessages: Messages =/);
  assert.match(i18nLocalesSource, /export const jaMessages: Messages =/);
  assert.match(i18nMessagesSource, /title: 'Camera luminance probe'/);
  assert.match(i18nMessagesSource, /roughMeterBoundary/);
  assert.match(i18nMessagesSource, /Start camera probe/);
  assert.match(i18nLocalesSource, /相機亮度偵測/);
});

test('standalone video preview uses the shared GSDF table model', () => {
  assert.match(videoBackgroundSource, /buildGsdfTableValues\(settings\)/);
  assert.match(videoBackgroundSource, /tableValues=\{gsdfTableValues\}/);
  assert.doesNotMatch(videoBackgroundSource, /eotf-ycbcr/);
  assert.match(videoBackgroundSource, /eotf-color/);
  assert.match(videoBackgroundSource, /hueRotate/);
  assert.match(videoBackgroundSource, /settings\.saturation/);
  assert.doesNotMatch(videoBackgroundSource, /settings\.colorModel/);
  assert.doesNotMatch(videoBackgroundSource, /type="gamma"/);
});
