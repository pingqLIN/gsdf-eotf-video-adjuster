import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const panelSource = readFileSync(new URL('../src/components/DraggablePanel.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const videoBackgroundSource = readFileSync(new URL('../src/components/VideoBackground.tsx', import.meta.url), 'utf8');
const contentSource = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');
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
  assert.match(panelSource, />LumaLift<\/div>/);
  assert.match(panelSource, /GSDF EOTF Adjuster · \{messages\.panel\.subtitle\}/);

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

  assert.match(panelSource, /type SidePanelMode = 'pattern' \| 'linearity' \| 'bidirectional' \| 'chart'/);
  assert.match(panelSource, /sidePanelOpen/);
  assert.match(panelSource, /sidePanelMode/);
  assert.match(panelSource, /ReferenceSidePanel/);
  assert.match(panelSource, /PanelRightOpen/);
  assert.match(panelSource, /PanelRightClose/);
  assert.match(panelSource, /messages\.panel\.toggleSidePanel/);
  assert.match(panelSource, /setSidePanelOpen\(\(value\) => !value\)/);
  assert.match(panelSource, /onModeChange=\{setSidePanelMode\}/);
  assert.match(panelSource, /FullDiagnosticPattern settings=\{settings\} messages=\{messages\}/);
  assert.match(panelSource, /ColorLinearityPattern settings=\{settings\} messages=\{messages\} figureControls=\{figureControls\}/);
  assert.match(panelSource, /CsdfFigureControlsPanel/);
  assert.match(panelSource, /messages\.panel\.fig9Controls/);
  assert.match(panelSource, /ColorBidirectionalPattern settings=\{settings\} messages=\{messages\}/);
  assert.match(panelSource, /messages\.panel\.colorLinearityPanel/);
  assert.match(panelSource, /messages\.panel\.bidirectionalColorPanel/);
  assert.match(panelSource, /GSDFChart settings=\{settings\} panelTheme=\{panelTheme\}/);
  assert.match(panelSource, /function ReferenceModeSwitch/);
  assert.match(panelSource, /grid-cols-4/);
  assert.match(panelSource, /onOpenFull=\{openInspectionMode\}/);
  assert.match(panelSource, /GSDF_PATTERN_VIEW_CHANGED/);
  assert.match(panelSource, /useExpandedOverlayViewport\(inspectionMode !== null \|\| sidePanelOpen\)/);
  assert.match(panelSource, /PANEL_DEFAULT_WIDTH = 400/);
  assert.match(panelSource, /PANEL_DEFAULT_HEIGHT = 760/);
  assert.match(panelSource, /PANEL_SIDE_PANEL_WIDTH = 800/);
  assert.match(panelSource, /className="border-b border-white\/10 p-3"/);
  assert.doesNotMatch(basicPanelBlock, /referenceSummaryTitle|referenceSummaryBody/);
  assert.doesNotMatch(basicPanelBlock, /openSidePanel\('pattern'\)|openSidePanel\('chart'\)/);
  assert.doesNotMatch(diagnosticPanelBlock, /openSidePanel\('pattern'\)|openSidePanel\('chart'\)/);
  assert.match(diagnosticPanelBlock, /DiagnosticCameraProbe settings=\{settings\} setSettings=\{setSettings\} messages=\{messages\}/);
  assert.match(diagnosticPanelBlock, /messages\.panel\.referencePanel/);
  assert.match(diagnosticPanelBlock, /setSidePanelMode\('linearity'\)/);
  assert.match(diagnosticPanelBlock, /messages\.panel\.curvePanel/);
  assert.doesNotMatch(panelSource, /legacy-linearity|legacy-rgb|legacyColorLinearity|Legacy RGB/);
  assert.equal((panelSource.match(/openSidePanel\('pattern'\)|openSidePanel\('chart'\)/g) ?? []).length, 0);
});

test('panel keeps project-owned GSDF pattern and chart logic', () => {
  const colorReferenceBlock = panelSource.slice(
    panelSource.indexOf('function getTriangleWave'),
    panelSource.indexOf('function InspectionModeHeader'),
  );
  const bidirectionalBlock = panelSource.slice(
    panelSource.indexOf('function drawBidirectionalColorBand'),
    panelSource.indexOf('function drawBidirectionalColorPattern'),
  );
  const colorLinearityPatternBlock = panelSource.slice(
    panelSource.indexOf('function drawColorLinearityPattern'),
    panelSource.indexOf('function getReferenceModeOptions'),
  );

  assert.match(panelSource, /drawDiagnosticPattern/);
  assert.match(panelSource, /drawLinePairBand/);
  assert.match(panelSource, /drawVerticalGradient/);
  assert.match(panelSource, /drawContinuousSweepCell/);
  assert.match(panelSource, /drawColorLinearityPattern/);
  assert.match(panelSource, /drawBidirectionalColorPattern/);
  assert.match(panelSource, /drawBidirectionalColorBand/);
  assert.match(panelSource, /const halfHeight = Math\.floor\(height \/ 2\)/);
  assert.match(panelSource, /function interpolateColor/);
  assert.match(panelSource, /type CsdfFigureMode = 'split' \| 'plain'/);
  assert.match(panelSource, /CSDF_FIG9_DEFAULT_CYCLES = 78/);
  assert.match(panelSource, /CSDF_FIG9_DEFAULT_EXAGGERATION = 1/);
  assert.match(panelSource, /function detectDisplayEnvironment/);
  assert.match(panelSource, /interface ReferenceDisplayScaleStatus/);
  assert.match(panelSource, /function detectReferenceDisplayScaleStatus/);
  assert.match(panelSource, /function useReferenceDisplayScaleStatus/);
  assert.match(panelSource, /function ReferenceDisplayScaleWarning/);
  assert.match(panelSource, /window\.visualViewport\?\.scale/);
  assert.match(panelSource, /hasScaleWarning: hasDeviceScale \|\| hasViewportScale/);
  assert.match(panelSource, /displayScaleStatus\.hasScaleWarning/);
  assert.match(panelSource, /matches\('\(dynamic-range: high\)'\)/);
  assert.match(panelSource, /matches\('\(color-gamut: p3\)'\)/);
  assert.match(panelSource, /window\.screen\?\.colorDepth/);
  assert.match(panelSource, /window\.devicePixelRatio/);
  assert.match(i18nMessagesSource, /displayScaleWarningTitle: 'Display scaling warning'/);
  assert.match(i18nLocalesSource, /displayScaleWarningTitle: '顯示縮放提醒'/);
  assert.match(panelSource, /function getAutoTunedCsdfFigureControls/);
  assert.match(panelSource, /targetPhysicalPixelsPerCycle/);
  assert.match(panelSource, /settings\.lmax < 120/);
  assert.match(panelSource, /mode: 'split'/);
  assert.match(panelSource, /function getTriangleWave/);
  assert.match(panelSource, /return 1 - Math\.abs\(2 \* normalizedProgress - 1\)/);
  assert.match(panelSource, /function remapCsdfFig9Channel/);
  assert.match(panelSource, /const gamma = 1 \/ \(1 \+ 0\.8 \* normalizedExaggeration\)/);
  assert.match(panelSource, /function applyCsdfFig9SplitChannel/);
  assert.match(panelSource, /controls\.mode !== 'split' \|\| globalX < renderWidth \/ 2/);
  assert.match(panelSource, /function drawCsdfFig9RampSide/);
  assert.match(panelSource, /const topHeight = Math\.round\(height \* 0\.32\)/);
  assert.match(panelSource, /const middleHeight = Math\.round\(height \* 0\.36\)/);
  assert.match(panelSource, /function applyReferenceGsdfYcbcrToneTable/);
  assert.match(panelSource, /function applyReferenceGsdfRgbToneTable/);
  assert.match(panelSource, /settings\.transferFormula/);
  assert.match(panelSource, /settings\.gsdfPipeline/);
  assert.match(panelSource, /function GsdfPipelinePills/);
  assert.match(panelSource, /gsdfPipeline: value === 'gsdf' && prev\.transferFormula !== 'gsdf'[\s\S]*DEFAULT_APP_SETTINGS\.gsdfPipeline/);
  assert.match(i18nMessagesSource, /gsdfPipelineTitle: 'GSDF pipeline'/);
  assert.match(panelSource, /buildLumaChromaMatrices/);
  assert.match(panelSource, /function applyReferenceColorMatrix/);
  assert.match(panelSource, /settings\.displayGamut/);
  assert.match(panelSource, /const ycbcr = applyReferenceColorMatrix\(rgbToUnitColor\(color\), matrices\.forward\)/);
  assert.match(panelSource, /function sampleReferenceToneTable/);
  assert.match(panelSource, /const mappedY = sampleReferenceToneTable\(transferTable, ycbcr\[0\]\)/);
  assert.match(panelSource, /const adjustedRgb = applyReferenceColorMatrix\(\[mappedY, ycbcr\[1\], ycbcr\[2\]\], matrices\.inverse\)/);
  assert.match(panelSource, /function formatColorReferenceRgb/);
  assert.match(panelSource, /context\.fillStyle = formatRgb\(topBottomColor\)/);
  assert.match(panelSource, /context\.fillStyle = formatRgb\(middleColor\)/);
  assert.match(panelSource, /context\.fillStyle = formatRgb\(row\.base\)/);
  assert.doesNotMatch(colorLinearityPatternBlock, /const transferTable = buildGsdfTableValues\(settings\)/);
  assert.doesNotMatch(colorLinearityPatternBlock, /transferTable,[\s\S]*settings/);
  assert.match(bidirectionalBlock, /applyColorReferenceToneTable\(/);
  assert.match(bidirectionalBlock, /settings\.displayGamut/);
  assert.doesNotMatch(panelSource, /const rampRatio = inverted \? 1 - baseRatio : baseRatio/);
  assert.match(panelSource, /function drawSingleDirectionColorRamp/);
  assert.match(panelSource, /const rampProgress = reversed \? 1 - progress : progress/);
  assert.doesNotMatch(panelSource, /function selectDiscreteGradientLineColor/);
  assert.doesNotMatch(panelSource, /BIDIRECTIONAL_COLOR_SAMPLE_COUNT/);
  assert.doesNotMatch(panelSource, /COLOR_LINE_PERIOD/);
  assert.doesNotMatch(panelSource, /drawDiscreteGradientSample/);
  assert.doesNotMatch(colorReferenceBlock, /context\.strokeRect/);
  assert.doesNotMatch(colorReferenceBlock, /strokeStyle = 'rgba\(0,0,0/);
  assert.doesNotMatch(panelSource, /context\.fillRect\(marginX, y \+ rowHeight \/ 2 - 1, patternWidth, 2\)/);
  assert.doesNotMatch(colorReferenceBlock, /calibratedSimulation/);
  assert.doesNotMatch(bidirectionalBlock, /sampleIndex/);
  assert.match(panelSource, /COLOR_LINEARITY_ROWS/);
  assert.match(panelSource, /amplitudePercent: 3\.0/);
  assert.match(panelSource, /differencePercent: 5\.9/);
  assert.match(panelSource, /COLOR_LINEARITY_PATTERN_HEIGHT = 920/);
  assert.match(panelSource, /function getScreenAwareReferenceSize/);
  assert.match(panelSource, /function useReferenceCanvas/);
  assert.match(panelSource, /getMeasuredReferenceCanvasSize\(canvas\)/);
  assert.match(panelSource, /renderSize \?\? getMeasuredReferenceCanvasSize\(canvas\)/);
  assert.match(panelSource, /drawPaperComparisonRamp/);
  assert.match(panelSource, /drawCsdfFig9LogoBlock/);
  assert.doesNotMatch(panelSource, /drawLegacyColorLinearityLogoBlock/);
  assert.match(panelSource, /BIDIRECTIONAL_COLOR_PATTERN_WIDTH = 1800/);
  assert.match(panelSource, /viewportScaleInfo/);
  assert.match(panelSource, /viewportScaleBest/);
  assert.match(panelSource, /fixedDesignSize/);
  assert.match(panelSource, /drawScaledReferenceDesign/);
  assert.match(panelSource, /useScreenAwareReferenceSize\(mode\)/);
  assert.match(panelSource, /onClick=\{\(\) => onChange\(getAutoTunedCsdfFigureControls\(settings, renderSize\)\)\}/);
  assert.match(i18nMessagesSource, /resetFig9Controls: 'Auto-tune Fig\. 9 controls from the current display environment'/);
  assert.doesNotMatch(panelSource, /column % 22 === 0 \? '#ffffff' : '#000000'/);
  assert.match(i18nMessagesSource, /CSDF VISUAL TEST PATTERN/);
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

test('optimize preset keeps the display EOTF neutral gamma baseline', () => {
  const optimizeBlock = panelSource.slice(
    panelSource.indexOf('const applyOptimizedPreset = () =>'),
    panelSource.indexOf('const handleLmaxChange ='),
  );

  assert.match(panelSource, /DEFAULT_TARGET_LUMINANCE_NITS/);
  assert.match(panelSource, /GAMMA_NEUTRAL_SLIDER_VALUE = luminanceToSliderValue\(DEFAULT_TARGET_LUMINANCE_NITS\)/);
  assert.match(panelSource, /function gammaCorrectionToAlignedSliderValue/);
  assert.match(panelSource, /function alignedSliderValueToGammaCorrection/);
  assert.match(optimizeBlock, /displayGamma: DEFAULT_APP_SETTINGS\.displayGamma/);
  assert.match(optimizeBlock, /gammaTarget: DEFAULT_APP_SETTINGS\.displayGamma/);
  assert.match(optimizeBlock, /transferFormula: DEFAULT_APP_SETTINGS\.transferFormula/);
  assert.match(optimizeBlock, /gsdfPipeline: DEFAULT_APP_SETTINGS\.gsdfPipeline/);
  assert.match(optimizeBlock, /strength: DEFAULT_APP_SETTINGS\.strength/);
  assert.match(optimizeBlock, /sourceIsLinear: false/);
  assert.match(optimizeBlock, /fineSharpness: DEFAULT_APP_SETTINGS\.fineSharpness/);
  assert.match(optimizeBlock, /mediumSharpness: DEFAULT_APP_SETTINGS\.mediumSharpness/);
  assert.doesNotMatch(optimizeBlock, /gammaTarget:\s*1\b/);
  assert.match(i18nMessagesSource, /display EOTF neutral gamma/);
  assert.match(i18nLocalesSource, /顯示 EOTF 中性 gamma/);
});

test('basic and advanced tools expose the revised correction controls', () => {
  const basicPanelBlock = panelSource.slice(
    panelSource.indexOf('const renderBasicPanel = () =>'),
    panelSource.indexOf('const renderAdvancedPanel = () =>'),
  );
  const advancedPanelBlock = panelSource.slice(
    panelSource.indexOf('const renderAdvancedPanel = () =>'),
    panelSource.indexOf('const renderDiagnosticPlaceholder = () =>'),
  );

  assert.match(panelSource, /function CheckboxControl/);
  assert.match(basicPanelBlock, /messages\.panel\.displayGamma/);
  assert.match(basicPanelBlock, /messages\.panel\.displayGammaInverseHint/);
  assert.match(basicPanelBlock, /messages\.panel\.displayGammaTitle/);
  assert.match(basicPanelBlock, /headerAddon/);
  assert.match(basicPanelBlock, /DisplayGammaSelect/);
  assert.match(basicPanelBlock, /gammaTargetToAlignedSliderValue\(2\.2, settings\.displayGamma\)/);
  assert.match(basicPanelBlock, /gammaTargetToAlignedSliderValue\(1, settings\.displayGamma\)/);
  assert.match(basicPanelBlock, /gammaTargetToAlignedSliderValue\(1\.8, settings\.displayGamma\)/);
  assert.match(basicPanelBlock, /gammaTargetToAlignedSliderValue\(2\.4, settings\.displayGamma\)/);
  assert.match(basicPanelBlock, /gammaTargetToAlignedSliderValue\(2\.6, settings\.displayGamma\)/);
  assert.match(basicPanelBlock, /messages\.panel\.curvePanel/);
  assert.match(basicPanelBlock, /GSDFChart settings=\{settings\} panelTheme=\{panelTheme\} messages=\{messages\}/);
  assert.match(basicPanelBlock, /gammaCorrectionToAlignedSliderValue\(gammaCorrection\)/);
  assert.match(basicPanelBlock, /alignedSliderValueToGammaCorrection\(value\)/);
  assert.match(basicPanelBlock, /setDisplayGamma\(value\)/);
  assert.match(basicPanelBlock, /setNumericSetting\('gammaTarget', settings\.displayGamma\)/);
  assert.match(basicPanelBlock, /rangeRowClassName="pr-11"/);
  assert.match(basicPanelBlock, /calibratedRange/);
  assert.match(basicPanelBlock, /onReset=\{\(\) => setNumericSetting\('strength', DEFAULT_APP_SETTINGS\.strength\)\}/);
  assert.match(basicPanelBlock, /gsdf-gamma-control/);
  assert.match(basicPanelBlock, /gsdf-filter-control/);
  assert.match(basicPanelBlock, /displayGamma/);
  assert.match(advancedPanelBlock, /remainingToneCount/);
  assert.match(advancedPanelBlock, /TONE_LEVEL_COUNT/);
  assert.match(advancedPanelBlock, /BLACK_CLIP_TONE_MAX/);
  assert.match(advancedPanelBlock, /WHITE_CLIP_TONE_MIN/);
  assert.match(advancedPanelBlock, /messages\.panel\.fineDetailSharpening/);
  assert.match(advancedPanelBlock, /messages\.panel\.mediumDetailSharpening/);
  assert.match(advancedPanelBlock, /fineSharpness/);
  assert.match(advancedPanelBlock, /mediumSharpness/);
  assert.match(advancedPanelBlock, /TEMPERATURE_MIN_K/);
  assert.match(advancedPanelBlock, /TEMPERATURE_MAX_K/);
  assert.match(advancedPanelBlock, /SATURATION_MIN/);
  assert.match(advancedPanelBlock, /SATURATION_MAX/);
  assert.match(advancedPanelBlock, /messages\.panel\.grayscale/);
  assert.match(advancedPanelBlock, /headerAddon/);
  assert.match(advancedPanelBlock, /getRecommendedImageDefaults\(settings\.lmax\)\.saturation/);
});

test('controls preserve expected interaction and resize affordances', () => {
  assert.match(panelSource, /function isInteractiveDragTarget/);
  assert.match(panelSource, /function isViewportPanBlockedTarget/);
  assert.match(panelSource, /button, input, label, select, textarea, a/);
  assert.match(panelSource, /data-no-drag/);
  assert.match(panelSource, /target instanceof Element/);
  assert.match(panelSource, /data-panel-drag-handle/);
  assert.match(panelSource, /data-viewport-ui/);
  assert.match(panelSource, /function InteractiveInspectionViewport/);
  assert.match(panelSource, /type InspectionScaleMode = 'actual' \| 'cover' \| 'fit'/);
  assert.match(panelSource, /scaleMode: 'actual'/);
  assert.match(panelSource, /getNextInspectionScaleMode/);
  assert.match(panelSource, /INSPECTION_ZOOM_MIN/);
  assert.match(panelSource, /onWheel=\{handleWheel\}/);
  assert.match(panelSource, /onPointerDown=\{handlePointerDown\}/);
  assert.match(panelSource, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(panelSource, /isViewportPanBlockedTarget\(event\.target\)/);
  assert.match(panelSource, /offsetX: current\.offsetX \+ deltaX/);
  assert.match(panelSource, /getDefaultInspectionSize/);
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
  assert.match(panelSource, /PANEL_TEXT_SCALE_STORAGE_KEY = 'gsdf_panel_text_scale'/);
  assert.match(panelSource, /function TextScaleControls/);
  assert.match(panelSource, /style=\{scaledPanelStyle\}/);
});

test('visual language keeps the precision-panel styling hooks', () => {
  const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(cssSource, /\.gsdf-panel-shell/);
  assert.match(cssSource, /--gsdf-ui-text-scale/);
  assert.match(cssSource, /\.gsdf-panel-header/);
  assert.match(cssSource, /\[data-panel-drag-handle\]/);
  assert.match(cssSource, /\.gsdf-text-scale-controls/);
  assert.match(cssSource, /\.gsdf-control-block/);
  assert.match(cssSource, /\.gsdf-control-headline/);
  assert.match(cssSource, /\.gsdf-control-reset/);
  assert.match(cssSource, /\.gsdf-range-mark--major/);
  assert.match(cssSource, /\.gsdf-basic-curve-block/);
  assert.match(cssSource, /\.gsdf-tab-switch/);
  assert.match(cssSource, /\.gsdf-checkbox/);
  assert.match(cssSource, /\.gsdf-gamma-control,\s*\.gsdf-filter-control/);
  assert.match(cssSource, /\.gsdf-calibrated-range-row \.gsdf-range/);
  assert.match(cssSource, /flex: 0 0 calc\(100% \+ 44px\)/);
  assert.match(cssSource, /width: calc\(100% \+ 44px\)/);
  assert.match(cssSource, /padding-block: 20px/);
  assert.match(cssSource, /border-radius: 3px !important/);
  assert.match(cssSource, /border-radius: 8px !important/);
  assert.match(cssSource, /\.gsdf-panel-header \.gsdf-icon-button/);
  assert.match(cssSource, /min-width: 44px/);
  assert.match(cssSource, /min-height: 44px/);
  assert.match(cssSource, /\.gsdf-reference-panel/);
  assert.match(cssSource, /\.gsdf-diagnostic-placeholder/);
  assert.match(cssSource, /\.gsdf-camera-probe/);
  assert.match(cssSource, /\.gsdf-camera-preview/);
  assert.match(cssSource, /\.gsdf-range::-webkit-slider-thumb \{\s*width: 12px;\s*height: 18px;/);
  assert.match(cssSource, /touch-action: manipulation/);
  assert.match(cssSource, /touch-action: none/);
  assert.doesNotMatch(cssSource, /gsdf-floating-window/);
});

test('content panel drag is frame-throttled and keeps tab-bound iframe control', () => {
  assert.match(contentSource, /function schedulePanelDrag/);
  assert.match(contentSource, /pendingPanelDrag/);
  assert.match(contentSource, /scheduleAnimationFrame/);
  assert.match(contentSource, /uiIframe\.style\.left = `\$\{panelPosition\.x\}px`/);
  assert.match(contentSource, /uiIframe\.style\.top = `\$\{panelPosition\.y\}px`/);
  assert.match(contentSource, /willChange: 'left, top, width, height'/);
  assert.match(contentSource, /uiIframe\.src = chrome\.runtime\.getURL\('ui\/index\.html\?mode=extension'\)/);
  assert.doesNotMatch(contentSource, /translate3d/);
  assert.doesNotMatch(contentSource, /chrome\.windows\.create/);
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
  assert.match(i18nMessagesSource, /localeShortNames/);
  assert.doesNotMatch(i18nMessagesSource, /calibratedSimulation/);
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
  assert.match(videoBackgroundSource, /settings\.transferFormula === 'csdf'/);
  assert.match(videoBackgroundSource, /settings\.gsdfPipeline === 'rgb'/);
  assert.match(videoBackgroundSource, /id="eotf-gsdf-rgb"/);
  assert.match(videoBackgroundSource, /id="eotf-gsdf-ycbcr"/);
  assert.match(videoBackgroundSource, /id="eotf-csdf"/);
  assert.match(videoBackgroundSource, /buildLumaChromaMatrices\(settings\.displayGamut\)/);
  assert.doesNotMatch(videoBackgroundSource, /result="csdf-ycc"/);
  assert.doesNotMatch(videoBackgroundSource, /in="csdf-adjusted"/);
  assert.match(videoBackgroundSource, /eotf-color/);
  assert.match(videoBackgroundSource, /hueRotate/);
  assert.match(videoBackgroundSource, /settings\.saturation/);
  assert.match(videoBackgroundSource, /settings\.grayscale/);
  assert.match(videoBackgroundSource, /settings\.fineSharpness/);
  assert.match(videoBackgroundSource, /settings\.mediumSharpness/);
  assert.match(videoBackgroundSource, /TONE_LEVEL_COUNT/);
  assert.match(videoBackgroundSource, /\$\{transferFilter\} url\(#eotf-levels\)/);
  assert.doesNotMatch(videoBackgroundSource, /url\(#eotf-levels\) \$\{transferFilter\}/);
  assert.doesNotMatch(videoBackgroundSource, /settings\.colorModel/);
  assert.doesNotMatch(videoBackgroundSource, /type="gamma"/);
});
