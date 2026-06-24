import React from 'react';
import { motion, useDragControls } from 'motion/react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleOff,
  Gauge,
  Grid3X3,
  Languages,
  Maximize2,
  MonitorUp,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Palette,
  Power,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Sun,
  Thermometer,
  X,
} from 'lucide-react';
import {
  AppSettings,
  BLACK_CLIP_TONE_MAX,
  BLACK_CLIP_TONE_MIN,
  buildGsdfStripeRows,
  DEFAULT_APP_SETTINGS,
  DEFAULT_GAMMA_TARGET,
  DEFAULT_TARGET_LUMINANCE_NITS,
  formatLuminance,
  gammaCorrectionToTarget,
  GAMMA_CORRECTION_MAX,
  GAMMA_CORRECTION_MIN,
  gammaTargetToCorrection,
  getRecommendedImageDefaults,
  LUMINANCE_MAX_NITS,
  LUMINANCE_MIN_NITS,
  LUMINANCE_SLIDER_MAX,
  luminanceToSliderValue,
  SATURATION_MAX,
  SATURATION_MIN,
  sliderValueToLuminance,
  TEMPERATURE_MAX_K,
  TEMPERATURE_MIN_K,
  TONE_LEVEL_COUNT,
  WHITE_CLIP_TONE_MAX,
  WHITE_CLIP_TONE_MIN,
} from '../types';
import { localeNames, supportedLocales, type Messages, type SupportedLocale } from '../i18n';
import { DiagnosticCameraProbe } from './DiagnosticCameraProbe';

const GSDFChart = React.lazy(() => import('./GSDFChart').then((module) => ({ default: module.GSDFChart })));

type PanelTab = 'basic' | 'advanced' | 'diagnostic';
type PanelTheme = 'dark' | 'light';
type SidePanelMode = 'pattern' | 'linearity' | 'bidirectional' | 'chart';
type InspectionMode = SidePanelMode | null;
type ResizeHandle = 'e' | 's' | 'se';
type InspectionScaleMode = 'actual' | 'cover' | 'fit';

const PANEL_THEME_STORAGE_KEY = 'gsdf_panel_theme';
const INSPECTION_MIN_WIDTH = 560;
const INSPECTION_MIN_HEIGHT = 420;
const INSPECTION_DEFAULT_WIDTH = 960;
const INSPECTION_DEFAULT_HEIGHT = 720;
const INSPECTION_VIEWPORT_MARGIN = 16;
const DIAGNOSTIC_PATTERN_WIDTH = 1800;
const DIAGNOSTIC_PATTERN_HEIGHT = 1200;
const COLOR_LINEARITY_PATTERN_WIDTH = 1800;
const COLOR_LINEARITY_PATTERN_HEIGHT = 920;
const BIDIRECTIONAL_COLOR_PATTERN_WIDTH = 1800;
const BIDIRECTIONAL_COLOR_PATTERN_HEIGHT = 920;
const BIDIRECTIONAL_COLOR_SAMPLE_COUNT = 50;
const COLOR_RAMP_SINE_CYCLES = 9;
const CHART_VIEW_WIDTH = 1040;
const CHART_VIEW_HEIGHT = 640;
const INSPECTION_ZOOM_MIN = 0.5;
const INSPECTION_ZOOM_MAX = 4;
const PANEL_DEFAULT_WIDTH = 400;
const PANEL_DEFAULT_HEIGHT = 760;
const PANEL_SIDE_PANEL_WIDTH = 800;
const PANEL_MIN_HEIGHT = 520;
const PANEL_MIN_WIDTH = 400;
const PANEL_VIEWPORT_MARGIN = 16;
const GAMMA_NEUTRAL_SLIDER_VALUE = luminanceToSliderValue(DEFAULT_TARGET_LUMINANCE_NITS);
let expandedOverlayCount = 0;

interface DraggablePanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  locale: SupportedLocale;
  messages: Messages;
  onLocaleChange: (locale: SupportedLocale) => void;
  extensionMode?: boolean;
  onExtensionDrag?: (deltaX: number, deltaY: number) => void;
  onExtensionResize?: (deltaWidth: number, deltaHeight: number) => void;
  onExtensionClose?: () => void;
}

interface SliderControlProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
  valueText: string;
  valueVariant?: 'metric' | 'label';
  minLabel?: string;
  maxLabel?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  disabled?: boolean;
  className?: string;
  rangeRowClassName?: string;
  calibratedRange?: boolean;
  headerAddon?: React.ReactNode;
  marks?: RangeMark[];
  resetTitle?: string;
  onReset?: () => void;
  onChange: (value: number) => void;
}

interface SegmentedControlProps<T extends string> {
  icon?: React.ReactNode;
  label: string;
  value: T;
  options: Array<{ value: T; label: string; title: string }>;
  disabled?: boolean;
  resetTitle?: string;
  onReset?: () => void;
  onChange: (value: T) => void;
}

interface CheckboxControlProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

interface PointerHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
}

interface RangeMark {
  value: number;
  label: string;
  tone?: 'default' | 'major';
}

function ControlResetButton({
  title,
  onReset,
  disabled = false,
}: {
  title: string;
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onReset}
      className="gsdf-control-reset flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
      data-no-drag
    >
      <RotateCcw size={13} />
    </button>
  );
}

function RangeMarks({
  min,
  max,
  marks,
}: {
  min: number;
  max: number;
  marks?: RangeMark[];
}) {
  if (!marks?.length || max === min) {
    return null;
  }

  return (
    <div className="gsdf-range-marks pointer-events-none absolute inset-x-0 top-full mt-1 h-4">
      {marks.map((mark) => {
        const position = clampValue(((mark.value - min) / (max - min)) * 100, 0, 100);
        return (
          <span
            key={`${mark.value}-${mark.label}`}
            className={`gsdf-range-mark ${mark.tone === 'major' ? 'gsdf-range-mark--major' : ''}`}
            style={{ left: `${position}%` }}
          >
            {mark.label}
          </span>
        );
      })}
    </div>
  );
}

function ModePill({
  children,
  tone = 'neutral',
  title,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'active' | 'amber';
  title?: string;
}) {
  const toneClass =
    tone === 'active'
      ? 'border-white/15 bg-white/[0.08] text-zinc-100'
      : tone === 'amber'
        ? 'border-stone-300/20 bg-stone-300/10 text-stone-200'
        : 'border-white/10 bg-white/[0.04] text-zinc-300';

  return (
    <span title={title} data-tone={tone} className={`gsdf-mode-pill inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-[3px] border px-2.5 text-[10px] font-semibold ${toneClass}`}>
      {children}
    </span>
  );
}

function SegmentedControl<T extends string>({
  icon,
  label,
  value,
  options,
  disabled = false,
  resetTitle,
  onReset,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={`gsdf-control-block space-y-2.5 transition-opacity ${disabled ? 'opacity-45 pointer-events-none' : 'opacity-100'}`}>
      <div className="gsdf-control-headline">
        <label className="gsdf-control-label flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="gsdf-control-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            {icon ?? <SlidersHorizontal size={14} />}
          </span>
          <span className="truncate">{label}</span>
        </label>
        {onReset && resetTitle && (
          <ControlResetButton title={resetTitle} onReset={onReset} disabled={disabled} />
        )}
      </div>
      <div className="gsdf-segmented-control grid grid-cols-3 gap-1 rounded-md border border-white/10 bg-[#080b0f] p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            disabled={disabled}
            aria-disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`gsdf-segment-button h-9 rounded text-[12px] font-semibold transition-colors ${
              value === option.value
                ? 'bg-zinc-100 text-[#0f1419] shadow-[0_10px_28px_rgba(0,0,0,0.28)]'
                : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 disabled:hover:bg-transparent disabled:hover:text-zinc-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderControl({
  icon,
  label,
  title,
  valueText,
  valueVariant = 'metric',
  minLabel,
  maxLabel,
  min,
  max,
  step = 1,
  value,
  disabled = false,
  className,
  rangeRowClassName,
  calibratedRange = false,
  headerAddon,
  marks,
  resetTitle,
  onReset,
  onChange,
}: SliderControlProps) {
  const valueTextClass =
    valueVariant === 'label'
      ? 'w-24 text-right font-sans text-[11px] font-semibold text-zinc-300'
      : 'font-mono text-[16px] font-semibold tabular-nums text-zinc-100';

  return (
    <div className={`gsdf-control-block space-y-2.5 transition-opacity ${disabled ? 'opacity-45 pointer-events-none' : 'opacity-100'} ${className ?? ''}`}>
      <div className="gsdf-control-headline">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <label title={title} className="gsdf-control-label flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
            <span className="gsdf-control-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
              {icon}
            </span>
            <span className="truncate">{label}</span>
          </label>
          {headerAddon}
        </div>
        <div className="gsdf-control-trailing">
          <div className={`shrink-0 ${valueTextClass}`}>
            {valueText}
          </div>
          {onReset && resetTitle && (
            <ControlResetButton title={resetTitle} onReset={onReset} disabled={disabled} />
          )}
        </div>
      </div>
      {calibratedRange ? (
        <div className={`gsdf-calibrated-range-row ${rangeRowClassName ?? ''}`}>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            aria-disabled={disabled}
            onChange={(event) => onChange(parseInt(event.target.value, 10))}
            className="gsdf-range"
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-1 font-mono text-[10px] text-zinc-500">
            {minLabel && <span>{minLabel}</span>}
            {maxLabel && <span>{maxLabel}</span>}
          </div>
          <RangeMarks min={min} max={max} marks={marks} />
        </div>
      ) : (
        <div className={`gsdf-range-row relative flex items-center gap-3 ${rangeRowClassName ?? ''}`}>
          {minLabel && <span className="w-8 text-right font-mono text-[10px] text-zinc-500">{minLabel}</span>}
          <div className="relative flex flex-1 items-center">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              disabled={disabled}
              aria-disabled={disabled}
              onChange={(event) => onChange(parseInt(event.target.value, 10))}
              className="gsdf-range w-full"
            />
            <RangeMarks min={min} max={max} marks={marks} />
          </div>
          {maxLabel && <span className="w-8 text-left font-mono text-[10px] text-zinc-500">{maxLabel}</span>}
        </div>
      )}
    </div>
  );
}

function gammaCorrectionToAlignedSliderValue(value: number): number {
  if (value < 0) {
    return Math.round(GAMMA_NEUTRAL_SLIDER_VALUE + (value / Math.abs(GAMMA_CORRECTION_MIN)) * GAMMA_NEUTRAL_SLIDER_VALUE);
  }

  return Math.round(GAMMA_NEUTRAL_SLIDER_VALUE + (value / GAMMA_CORRECTION_MAX) * (LUMINANCE_SLIDER_MAX - GAMMA_NEUTRAL_SLIDER_VALUE));
}

function alignedSliderValueToGammaCorrection(value: number): number {
  if (value < GAMMA_NEUTRAL_SLIDER_VALUE) {
    return Math.round(((value - GAMMA_NEUTRAL_SLIDER_VALUE) / GAMMA_NEUTRAL_SLIDER_VALUE) * Math.abs(GAMMA_CORRECTION_MIN));
  }

  return Math.round(((value - GAMMA_NEUTRAL_SLIDER_VALUE) / (LUMINANCE_SLIDER_MAX - GAMMA_NEUTRAL_SLIDER_VALUE)) * GAMMA_CORRECTION_MAX);
}

function gammaTargetToAlignedSliderValue(value: number): number {
  return gammaCorrectionToAlignedSliderValue(gammaTargetToCorrection(value));
}

function CheckboxControl({
  icon,
  label,
  title,
  checked,
  disabled = false,
  onChange,
}: CheckboxControlProps) {
  return (
    <label
      title={title}
      className={`gsdf-control-block flex min-h-[74px] cursor-pointer items-center justify-between gap-3 transition-opacity ${disabled ? 'pointer-events-none opacity-45' : 'opacity-100'}`}
    >
      <span className="gsdf-control-label flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
        <span className="gsdf-control-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
          {icon}
        </span>
        <span className="min-w-0">{label}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="gsdf-checkbox h-5 w-5 shrink-0"
      />
    </label>
  );
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, input, label, select, textarea, a, [role="button"], [data-no-drag]'));
}

function isViewportPanBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, input, label, select, textarea, a, [role="button"], [data-viewport-ui]'));
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getDefaultInspectionSize() {
  if (typeof window === 'undefined') {
    return {
      width: INSPECTION_DEFAULT_WIDTH,
      height: INSPECTION_DEFAULT_HEIGHT,
    };
  }

  return {
    width: Math.max(INSPECTION_MIN_WIDTH, window.innerWidth - INSPECTION_VIEWPORT_MARGIN),
    height: Math.max(INSPECTION_MIN_HEIGHT, window.innerHeight - INSPECTION_VIEWPORT_MARGIN),
  };
}

function getBaseInspectionScale(
  mode: InspectionScaleMode,
  container: { width: number; height: number },
  content: { width: number; height: number },
): number {
  if (mode === 'actual') {
    return 1;
  }

  const scaleX = container.width / content.width;
  const scaleY = container.height / content.height;
  const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function getNextInspectionScaleMode(mode: InspectionScaleMode): InspectionScaleMode {
  if (mode === 'actual') {
    return 'cover';
  }
  if (mode === 'cover') {
    return 'fit';
  }
  return 'actual';
}

function getInspectionScaleModeLabel(mode: InspectionScaleMode, messages: Messages): string {
  if (mode === 'actual') {
    return messages.panel.viewportScaleActual;
  }
  if (mode === 'cover') {
    return messages.panel.viewportScaleCover;
  }
  return messages.panel.viewportScaleFit;
}

function getDefaultPanelSize(sidePanelOpen = false) {
  return {
    width: sidePanelOpen ? PANEL_SIDE_PANEL_WIDTH : PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_HEIGHT,
  };
}

function clampStandalonePanelSize(size: { width: number; height: number }, sidePanelOpen = false) {
  const targetWidth = sidePanelOpen ? PANEL_SIDE_PANEL_WIDTH : PANEL_DEFAULT_WIDTH;
  const maxWidth = typeof window === 'undefined'
    ? targetWidth
    : Math.max(PANEL_MIN_WIDTH, window.innerWidth - PANEL_VIEWPORT_MARGIN);
  const maxHeight = typeof window === 'undefined'
    ? PANEL_DEFAULT_HEIGHT
    : Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_VIEWPORT_MARGIN);

  return {
    width: clampValue(size.width, PANEL_MIN_WIDTH, maxWidth),
    height: clampValue(size.height, PANEL_MIN_HEIGHT, maxHeight),
  };
}

function getResizeDeltas(handle: ResizeHandle, deltaX: number, deltaY: number) {
  return {
    deltaWidth: handle === 's' ? 0 : deltaX,
    deltaHeight: handle === 'e' ? 0 : deltaY,
  };
}

function trySetPointerCapture(element: Element, pointerId: number) {
  try {
    if ('setPointerCapture' in element) {
      element.setPointerCapture(pointerId);
    }
  } catch {
    // Synthetic pointer events used by tests may not have an active pointer.
  }
}

function tryReleasePointerCapture(element: Element, pointerId: number) {
  try {
    if ('hasPointerCapture' in element && element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Pointer capture can already be released by the browser on pointerup.
  }
}

function postExpandedOverlayState(open: boolean) {
  if (!window.parent || window.parent === window) {
    return;
  }

  window.parent.postMessage({
    type: 'GSDF_PATTERN_VIEW_CHANGED',
    payload: { open },
  }, '*');
}

function postPanelLayoutRequest(width: number, height: number) {
  if (!window.parent || window.parent === window) {
    return;
  }

  window.parent.postMessage({
    type: 'GSDF_PANEL_LAYOUT_REQUEST',
    payload: { width, height },
  }, '*');
}

function useExpandedOverlayViewport(open: boolean) {
  React.useEffect(() => {
    if (!open) {
      return;
    }

    expandedOverlayCount += 1;
    postExpandedOverlayState(true);

    return () => {
      expandedOverlayCount = Math.max(0, expandedOverlayCount - 1);
      postExpandedOverlayState(expandedOverlayCount > 0);
    };
  }, [open]);
}

function EffectSwitch({
  enabled,
  onToggle,
  label = 'Effect application',
}: {
  enabled: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={label}
      onClick={onToggle}
      data-state={enabled ? 'on' : 'off'}
      className="gsdf-effect-switch relative inline-flex h-8 w-14 shrink-0 items-center rounded-md border border-white/10 bg-[#0b0d10] p-1 transition-colors hover:bg-white/[0.06]"
      data-no-drag
    >
      <span className={`pointer-events-none absolute inset-1 rounded transition-colors ${enabled ? 'bg-white/[0.10]' : 'bg-white/[0.04]'}`} />
      <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded text-[#0b0d10] transition-transform ${enabled ? 'translate-x-6 bg-zinc-100' : 'translate-x-0 bg-zinc-500'}`}>
        <Power size={13} />
      </span>
    </button>
  );
}

function PanelTabSwitch({
  value,
  onChange,
  panelTheme,
  messages,
}: {
  value: PanelTab;
  onChange: (value: PanelTab) => void;
  panelTheme: PanelTheme;
  messages: Messages;
}) {
  return (
    <div
      role="tablist"
      aria-label={messages.panel.panelTabs}
      className="gsdf-tab-switch relative grid h-8 min-w-[184px] max-w-[212px] flex-1 grid-cols-3 rounded-md border border-white/10 bg-[#080b0f] p-1"
      data-no-drag
    >
      <span
        className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(33.333%-4px)] rounded bg-zinc-100 shadow transition-transform ${
          value === 'advanced' ? 'translate-x-[calc(100%+4px)]' : value === 'diagnostic' ? 'translate-x-[calc(200%+8px)]' : 'translate-x-0'
        }`}
      />
      {(['basic', 'advanced', 'diagnostic'] as PanelTab[]).map((tab) => {
        const selected = value === tab;
        const title = tab === 'basic'
          ? messages.panel.switchToBasic
          : tab === 'advanced'
            ? messages.panel.switchToAdvanced
            : messages.panel.switchToDiagnostic;
        const label = tab === 'basic'
          ? messages.panel.basicTab
          : tab === 'advanced'
            ? messages.panel.advancedTab
            : messages.panel.diagnosticTab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            title={title}
            onClick={() => onChange(tab)}
            style={selected ? { color: panelTheme === 'light' ? '#f8fafc' : '#111418' } : undefined}
            className={`relative z-10 rounded text-[11px] font-semibold transition-colors ${
              selected ? '' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StatusDeck({
  settings,
  onLmaxChange,
  onResetLmax,
  onResetDefault,
  messages,
}: {
  settings: AppSettings;
  onLmaxChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onResetLmax: () => void;
  onResetDefault: () => void;
  messages: Messages;
}) {
  const statusLabel = settings.enabled ? messages.panel.active : messages.panel.standby;

  return (
    <section className="gsdf-status-deck space-y-3 rounded-md border border-white/10 bg-[#0a0e13] p-4 shadow-inner">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-zinc-400">
            {settings.enabled ? <CheckCircle2 size={14} className="text-zinc-200" /> : <CircleOff size={14} className="text-zinc-500" />}
            <span>{statusLabel}</span>
          </div>
          <div className="gsdf-status-inline-metrics flex min-w-0 flex-wrap items-center justify-start gap-1.5">
            <ModePill
              tone={settings.enabled ? 'active' : 'neutral'}
              title={messages.panel.gsdfMixTitle}
            >
              <MonitorUp size={13} />
              GSDF
            </ModePill>
            <ModePill title={messages.panel.gammaPillTitle}>
              <Activity size={13} />
              <span className="gsdf-pill-label">γ</span>
              <span className="gsdf-pill-metric">{settings.gammaTarget.toFixed(1)}</span>
            </ModePill>
            <ModePill title={messages.panel.filterPillTitle}>
              <Gauge size={13} />
              <span className="gsdf-pill-label">mix</span>
              <span className="gsdf-pill-metric">{settings.strength}%</span>
            </ModePill>
            <ModePill>
              <BarChart3 size={13} />
              {settings.displayGamut === 'display-p3' ? 'P3' : settings.displayGamut === 'adobe-rgb' ? 'Adobe RGB' : 'sRGB'}
            </ModePill>
          </div>
        </div>
        <button
          onClick={onResetDefault}
          className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          title={messages.panel.resetTitle}
          data-no-drag
          type="button"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div
        title={messages.panel.lmaxTitle}
        className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
      >
        <span className="font-mono text-[30px] leading-none text-zinc-50 tabular-nums">{formatLuminance(settings.lmax)}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">nits</span>
        <span className="text-[11px] font-semibold text-zinc-300">{messages.panel.lmaxLabel}</span>
        <span className="text-[9px] font-semibold text-zinc-500">{messages.panel.lmaxNote}</span>
      </div>
      <div className="gsdf-lmax-range-row space-y-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <div className="relative">
            <input
              type="range"
              min="0"
              max={LUMINANCE_SLIDER_MAX}
              step="1"
              value={luminanceToSliderValue(settings.lmax)}
              onChange={onLmaxChange}
              className="gsdf-range w-full"
            />
            <RangeMarks
              min={0}
              max={LUMINANCE_SLIDER_MAX}
              marks={[
                {
                  value: luminanceToSliderValue(DEFAULT_TARGET_LUMINANCE_NITS),
                  label: String(DEFAULT_TARGET_LUMINANCE_NITS),
                  tone: 'major',
                },
              ]}
            />
          </div>
          <ControlResetButton title={messages.panel.resetTitle} onReset={onResetLmax} />
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-1 font-mono text-[10px] text-zinc-500">
          <span>{LUMINANCE_MIN_NITS}</span>
          <span className="gsdf-range-endpoint-major">{DEFAULT_TARGET_LUMINANCE_NITS}</span>
          <span className="text-right">{LUMINANCE_MAX_NITS}</span>
        </div>
      </div>
    </section>
  );
}

function InteractiveInspectionViewport({
  designWidth,
  designHeight,
  children,
  className = '',
  contentClassName = '',
  ariaLabel,
  messages,
}: {
  designWidth: number;
  designHeight: number;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  messages: Messages;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const panStartRef = React.useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = React.useState({ width: 1, height: 1 });
  const [viewport, setViewport] = React.useState({
    scaleMode: 'fit' as InspectionScaleMode,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const size = {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const scaleFactor = event.deltaY < 0 ? 1.08 : 0.92;

    setViewport((current) => {
      const currentBaseScale = getBaseInspectionScale(current.scaleMode, size, { width: designWidth, height: designHeight });
      const currentScale = currentBaseScale * current.zoom;
      const currentOriginX = (size.width - designWidth * currentScale) / 2 + current.offsetX;
      const currentOriginY = (size.height - designHeight * currentScale) / 2 + current.offsetY;
      const contentX = (pointerX - currentOriginX) / currentScale;
      const contentY = (pointerY - currentOriginY) / currentScale;
      const nextZoom = clampValue(Number((current.zoom * scaleFactor).toFixed(3)), INSPECTION_ZOOM_MIN, INSPECTION_ZOOM_MAX);
      const nextScale = currentBaseScale * nextZoom;
      const nextCenteredX = (size.width - designWidth * nextScale) / 2;
      const nextCenteredY = (size.height - designHeight * nextScale) / 2;

      return {
        ...current,
        zoom: nextZoom,
        offsetX: pointerX - nextCenteredX - contentX * nextScale,
        offsetY: pointerY - nextCenteredY - contentY * nextScale,
      };
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isViewportPanBlockedTarget(event.target)) {
      return;
    }

    event.preventDefault();
    panStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    trySetPointerCapture(event.currentTarget, event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current || panStartRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - panStartRef.current.x;
    const deltaY = event.clientY - panStartRef.current.y;
    panStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setViewport((current) => ({
      ...current,
      offsetX: current.offsetX + deltaX,
      offsetY: current.offsetY + deltaY,
    }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current?.pointerId === event.pointerId) {
      tryReleasePointerCapture(event.currentTarget, event.pointerId);
    }
    panStartRef.current = null;
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setViewport((current) => ({
      scaleMode: getNextInspectionScaleMode(current.scaleMode),
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    }));
  };

  const baseScale = getBaseInspectionScale(viewport.scaleMode, containerSize, { width: designWidth, height: designHeight });
  const scale = baseScale * viewport.zoom;
  const translateX = (containerSize.width - designWidth * scale) / 2 + viewport.offsetX;
  const translateY = (containerSize.height - designHeight * scale) / 2 + viewport.offsetY;
  const scalePercent = `${Math.round(scale * 100)}%`;
  const isBestScale = Math.abs(scale - 1) < 0.005;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={`gsdf-inspection-viewport relative min-h-0 flex-1 overflow-hidden ${className}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{ touchAction: 'none', cursor: panStartRef.current ? 'grabbing' : 'grab' }}
      data-no-drag
    >
      <div
        className="pointer-events-none absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-md border border-white/35 bg-black/90 px-3 py-2 font-mono text-[12px] font-semibold text-zinc-100 shadow-2xl ring-1 ring-black/80 backdrop-blur"
        data-viewport-ui
      >
        <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-black">{messages.panel.viewportScaleInfo}</span>
        <span>{getInspectionScaleModeLabel(viewport.scaleMode, messages)}</span>
        <span className="text-[14px] text-white">{scalePercent}</span>
        <span className="text-zinc-300">{designWidth}x{designHeight}</span>
        {isBestScale ? (
          <span className="rounded border border-emerald-300/60 bg-emerald-300/20 px-1.5 py-0.5 text-[11px] text-emerald-100">
            {messages.panel.viewportScaleBest}
          </span>
        ) : null}
      </div>
      <div
        className={`absolute top-0 left-0 ${contentClassName}`}
        style={{
          width: designWidth,
          height: designHeight,
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FullDiagnosticPattern({
  settings,
  messages,
  zoom = 1,
  fixedDesignSize = false,
}: {
  settings: AppSettings;
  messages: Messages;
  zoom?: number;
  fixedDesignSize?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      if (fixedDesignSize) {
        canvas.width = Math.max(1, Math.floor(DIAGNOSTIC_PATTERN_WIDTH * dpr));
        canvas.height = Math.max(1, Math.floor(DIAGNOSTIC_PATTERN_HEIGHT * dpr));
        canvas.style.width = `${DIAGNOSTIC_PATTERN_WIDTH}px`;
        canvas.style.height = `${DIAGNOSTIC_PATTERN_HEIGHT}px`;
        const context = canvas.getContext('2d');
        if (!context) {
          return;
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.imageSmoothingEnabled = false;
        drawDiagnosticPattern(context, settings, messages);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#050505';
      context.fillRect(0, 0, rect.width, rect.height);

      const designWidth = DIAGNOSTIC_PATTERN_WIDTH;
      const designHeight = DIAGNOSTIC_PATTERN_HEIGHT;
      const scale = Math.min(rect.width / designWidth, rect.height / designHeight) * zoom;
      const offsetX = (rect.width - designWidth * scale) / 2;
      const offsetY = (rect.height - designHeight * scale) / 2;

      context.save();
      context.translate(offsetX, offsetY);
      context.scale(scale, scale);
      drawDiagnosticPattern(context, settings, messages);
      context.restore();
    };

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();

    return () => observer.disconnect();
  }, [fixedDesignSize, messages, settings, zoom]);

  return <canvas ref={canvasRef} className="h-full w-full bg-black" aria-label={messages.panel.diagnosticPatternAria} />;
}

function drawDiagnosticPattern(context: CanvasRenderingContext2D, settings: AppSettings, messages: Messages) {
  const width = DIAGNOSTIC_PATTERN_WIDTH;
  const height = DIAGNOSTIC_PATTERN_HEIGHT;
  const outputRows = buildGsdfStripeRows(settings);
  const modulationPeriods = [18, 12, 6, 4];
  const rowCount = 18;
  const chartX = 250;
  const chartY = 130;
  const chartW = 1300;
  const chartH = 900;
  const rowH = chartH / rowCount;

  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#b8b8b8';
  context.lineWidth = 2;
  context.strokeRect(18, 18, width - 36, height - 36);

  drawVerticalGradient(context, 52, 130, 140, 900, true);
  drawVerticalGradient(context, 1608, 130, 140, 900, false);
  drawLinePairBand(context, 250, 44, 1300, 72, false);
  drawLinePairBand(context, 250, 1084, 1300, 72, true);

  drawReadableText(context, messages.diagnosticPattern.title, 58, 80, '34px Cascadia Mono, monospace', '#ffffff');
  drawReadableText(context, messages.diagnosticPattern.subtitle, 58, 112, '19px Cascadia Mono, monospace', '#e5e5e5');

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const y = chartY + rowIndex * rowH;
    const gray = Math.round((rowIndex / (rowCount - 1)) * 255);
    context.fillStyle = `rgb(${gray},${gray},${gray})`;
    context.fillRect(chartX, y, chartW, rowH + 0.5);
    context.strokeStyle = rowIndex % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.moveTo(chartX, y);
    context.lineTo(chartX + chartW, y);
    context.stroke();

    drawModulationCells(context, chartX + 38, y + 6, 420, rowH - 12, gray, modulationPeriods, 'horizontal');
    drawModulationCells(context, chartX + chartW - 458, y + 6, 420, rowH - 12, gray, [...modulationPeriods].reverse(), 'vertical');

    const sample = outputRows[rowIndex % outputRows.length];
    drawContinuousSweepCell(context, chartX + 520, y + 9, 210, rowH - 18, sample.left, sample.right);
    drawContinuousSweepCell(context, chartX + 770, y + 9, 210, rowH - 18, gray, Math.min(255, gray + (rowIndex % 2 === 0 ? 8 : 2)));

    const rowLabel = String(gray).padStart(3, '0');
    const rowLabelFill = gray > 128 ? '#050505' : '#ffffff';
    const rowLabelStroke = gray > 128 ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.9)';
    drawReadableText(context, rowLabel, chartX + chartW / 2 - 22, y + rowH / 2 + 6, '18px Cascadia Mono, monospace', rowLabelFill, rowLabelStroke);
  }

  context.strokeStyle = '#b8b8b8';
  context.lineWidth = 2;
  context.strokeRect(chartX, chartY, chartW, chartH);

  drawReadableText(context, messages.diagnosticPattern.horizontalModulation, chartX + 38, chartY + chartH + 38, '18px Cascadia Mono, monospace', '#f4f4f5');
  drawReadableText(context, messages.diagnosticPattern.gsdfOutputSweep, chartX + 520, chartY + chartH + 38, '18px Cascadia Mono, monospace', '#f4f4f5');
  drawReadableText(context, messages.diagnosticPattern.fixedContrastSweep, chartX + 770, chartY + chartH + 38, '18px Cascadia Mono, monospace', '#f4f4f5');
  drawReadableText(context, messages.diagnosticPattern.verticalModulation, chartX + chartW - 458, chartY + chartH + 38, '18px Cascadia Mono, monospace', '#f4f4f5');
}

function drawReadableText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fillStyle: string,
  strokeStyle = 'rgba(0,0,0,0.92)',
) {
  context.save();
  context.font = font;
  context.lineWidth = 5;
  context.strokeStyle = strokeStyle;
  context.strokeText(text, x, y);
  context.fillStyle = fillStyle;
  context.fillText(text, x, y);
  context.restore();
}

function drawVerticalGradient(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, invert: boolean) {
  const gradient = context.createLinearGradient(0, y, 0, y + height);
  gradient.addColorStop(0, invert ? '#fff' : '#000');
  gradient.addColorStop(1, invert ? '#000' : '#fff');
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);

  for (let band = 0; band < 12; band += 1) {
    const bandY = y + band * (height / 12);
    const gray = Math.round((band / 11) * 255);
    drawStripeRect(context, x + width - 34, bandY, 28, height / 12, gray, Math.min(255, gray + 5), 6, 'vertical');
  }

  context.strokeStyle = '#8c8c8c';
  context.strokeRect(x, y, width, height);
}

function drawLinePairBand(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, invert: boolean) {
  const periods = [2, 4, 6, 8, 12, 16];
  const cellW = width / periods.length;
  periods.forEach((period, index) => {
    const left = x + index * cellW;
    drawStripeRect(context, left + 8, y, cellW - 16, height, invert ? 128 : 0, invert ? 255 : 128, period, 'vertical');
    context.strokeStyle = '#6f6f6f';
    context.strokeRect(left + 8, y, cellW - 16, height);
  });
}

function drawModulationCells(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  base: number,
  periods: number[],
  direction: 'horizontal' | 'vertical',
) {
  const cellW = width / periods.length;
  periods.forEach((period, index) => {
    const contrast = index === 0 || index === periods.length - 1 ? 2 : 8;
    const low = Math.max(0, base - contrast);
    const high = Math.min(255, base + contrast);
    drawStripeRect(context, x + index * cellW + 4, y, cellW - 8, height, low, high, period, direction);
  });
}

function drawContinuousSweepCell(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, left: number, right: number) {
  let cursor = 0;
  let useRight = false;
  while (cursor < width) {
    const progress = cursor / width;
    const stripeWidth = Math.max(2, 26 - progress ** 1.35 * 23);
    const value = useRight ? right : left;
    context.fillStyle = `rgb(${value},${value},${value})`;
    context.fillRect(x + cursor, y, Math.min(stripeWidth, width - cursor), height);
    cursor += stripeWidth;
    useRight = !useRight;
  }
}

function drawStripeRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  low: number,
  high: number,
  period: number,
  direction: 'horizontal' | 'vertical',
) {
  const limit = direction === 'vertical' ? width : height;
  let cursor = 0;
  while (cursor < limit) {
    const value = Math.floor(cursor / period) % 2 === 0 ? low : high;
    context.fillStyle = `rgb(${value},${value},${value})`;
    if (direction === 'vertical') {
      context.fillRect(x + cursor, y, Math.min(period, width - cursor), height);
    } else {
      context.fillRect(x, y + cursor, width, Math.min(period, height - cursor));
    }
    cursor += period;
  }
}

type RgbTuple = [number, number, number];
type ColorRampChannel = 0 | 1 | 2;

interface ColorLinearityRow {
  label: string;
  base: RgbTuple;
  secondary: RgbTuple;
  modulationChannel: ColorRampChannel;
  amplitudePercent: number;
  differencePercent: number;
}

const COLOR_LINEARITY_ROWS: ColorLinearityRow[] = [
  { label: 'R-Y', base: [255, 0, 0], secondary: [255, 255, 0], modulationChannel: 1, amplitudePercent: 3.0, differencePercent: 5.9 },
  { label: 'R-M', base: [255, 0, 0], secondary: [255, 0, 255], modulationChannel: 2, amplitudePercent: 15, differencePercent: 24 },
  { label: 'B-M', base: [0, 0, 255], secondary: [255, 0, 255], modulationChannel: 0, amplitudePercent: 10, differencePercent: 7.8 },
  { label: 'B-C', base: [0, 0, 255], secondary: [0, 255, 255], modulationChannel: 1, amplitudePercent: 3.0, differencePercent: 3.5 },
  { label: 'G-C', base: [0, 255, 0], secondary: [0, 255, 255], modulationChannel: 2, amplitudePercent: 20, differencePercent: 26 },
  { label: 'G-Y', base: [0, 255, 0], secondary: [255, 255, 0], modulationChannel: 0, amplitudePercent: 25, differencePercent: 17 },
];

function clampTone(value: number): number {
  return Math.round(clampValue(value, 0, 255));
}

function formatRgb(color: RgbTuple): string {
  return `rgb(${clampTone(color[0])},${clampTone(color[1])},${clampTone(color[2])})`;
}

function interpolateColor(from: RgbTuple, to: RgbTuple, amount: number): RgbTuple {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

function drawColorRamp(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  row: ColorLinearityRow,
  calibrated: boolean,
  bandBoost = 1,
) {
  const amplitude = (row.amplitudePercent / 100) * 255 * (calibrated ? 1.08 : 0.62) * bandBoost;
  const cycles = COLOR_RAMP_SINE_CYCLES;

  for (let column = 0; column < width; column += 1) {
    const progress = width <= 1 ? 0 : column / (width - 1);
    const triangle = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
    const smoothProgress = 0.5 - Math.cos(triangle * Math.PI) / 2;
    const color = interpolateColor(row.base, row.secondary, smoothProgress);
    const uncalibratedVisibility = 0.18 + 0.72 * Math.exp(-((progress - 0.52) ** 2) / 0.028);
    const visibility = calibrated ? 1 : uncalibratedVisibility;
    const sine = Math.sin(progress * Math.PI * 2 * cycles) * amplitude * visibility;
    color[row.modulationChannel] = clampTone(color[row.modulationChannel] + sine);
    context.fillStyle = formatRgb(color);
    context.fillRect(x + column, y, 1, height);
  }

}

function drawColorLinearityLogoBlock(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  row: ColorLinearityRow,
) {
  const faintBackground = [...row.base] as RgbTuple;
  const background = [...row.base] as RgbTuple;
  faintBackground[row.modulationChannel] = clampTone(faintBackground[row.modulationChannel] + (row.differencePercent / 100) * 255 * 0.28);
  background[row.modulationChannel] = clampTone(background[row.modulationChannel] + (row.differencePercent / 100) * 255);
  const splitX = x + width / 2;

  context.fillStyle = formatRgb(faintBackground);
  context.fillRect(x, y, width / 2, height);
  context.fillStyle = formatRgb(background);
  context.fillRect(splitX, y, width / 2, height);

  context.fillStyle = formatRgb(row.base);
  context.font = '62px Cascadia Mono, monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.globalAlpha = 0.76;
  context.fillText('CSDF', x + width / 2, y + height / 2);
  context.globalAlpha = 1;

  context.strokeStyle = 'rgba(0,0,0,0.25)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(splitX, y);
  context.lineTo(splitX, y + height);
  context.stroke();
  context.strokeRect(x, y, width, height);
}

function drawPaperComparisonRamp(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  row: ColorLinearityRow,
  calibrated: boolean,
) {
  drawColorRamp(context, x, y, width, height, row, calibrated);

  const bandHeight = Math.max(18, height * 0.3);
  const bandY = y + height * 0.36;
  const bandInset = calibrated ? 0 : width * 0.09;
  const bandWidth = calibrated ? width : width * 0.76;
  context.save();
  context.beginPath();
  context.rect(x + bandInset, bandY, bandWidth, bandHeight);
  context.clip();
  drawColorRamp(context, x, y, width, height, row, calibrated, calibrated ? 1.18 : 1.05);
  context.restore();
}

function ColorBidirectionalPattern({ messages }: { messages: Messages }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(BIDIRECTIONAL_COLOR_PATTERN_WIDTH * dpr));
    canvas.height = Math.max(1, Math.floor(BIDIRECTIONAL_COLOR_PATTERN_HEIGHT * dpr));
    canvas.style.width = `${BIDIRECTIONAL_COLOR_PATTERN_WIDTH}px`;
    canvas.style.height = `${BIDIRECTIONAL_COLOR_PATTERN_HEIGHT}px`;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.imageSmoothingEnabled = false;
    drawBidirectionalColorPattern(context);
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full bg-black" aria-label={messages.panel.bidirectionalPatternAria} />;
}

function drawBidirectionalColorBand(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  row: ColorLinearityRow,
) {
  const halfHeight = Math.floor(height / 2);
  const lowerHeight = height - halfHeight;
  const sampleWidth = width / BIDIRECTIONAL_COLOR_SAMPLE_COUNT;

  for (let sampleIndex = 0; sampleIndex < BIDIRECTIONAL_COLOR_SAMPLE_COUNT; sampleIndex += 1) {
    const sampleX = x + sampleIndex * sampleWidth;
    const sampleW = Math.ceil(sampleWidth + 0.5);
    const forwardProgress = sampleIndex / (BIDIRECTIONAL_COLOR_SAMPLE_COUNT - 1);
    const rotatedProgress = (BIDIRECTIONAL_COLOR_SAMPLE_COUNT - 1 - sampleIndex) / (BIDIRECTIONAL_COLOR_SAMPLE_COUNT - 1);
    drawDiscreteGradientSample(context, sampleX, y, sampleW, halfHeight, row, forwardProgress);
    drawDiscreteGradientSample(context, sampleX, y + halfHeight, sampleW, lowerHeight, row, rotatedProgress);
  }
}

function drawDiscreteGradientSample(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  row: ColorLinearityRow,
  progress: number,
) {
  for (let column = 0; column < width; column += 1) {
    context.fillStyle = formatRgb(selectDiscreteGradientLineColor(row, progress, column));
    context.fillRect(x + column, y, 1, height);
  }
}

function selectDiscreteGradientLineColor(row: ColorLinearityRow, progress: number, localColumn: number): RgbTuple {
  const linePeriod = 8;
  const linePhase = ((localColumn % linePeriod) + 0.5) / linePeriod;
  return linePhase < progress ? row.secondary : row.base;
}

function drawBidirectionalColorPattern(
  context: CanvasRenderingContext2D,
  renderWidth = BIDIRECTIONAL_COLOR_PATTERN_WIDTH,
  renderHeight = BIDIRECTIONAL_COLOR_PATTERN_HEIGHT,
) {
  context.fillStyle = '#000000';
  context.fillRect(0, 0, renderWidth, renderHeight);

  const marginX = 68;
  const rowHeight = 132;
  const patternWidth = renderWidth - marginX * 2;
  const patternHeight = COLOR_LINEARITY_ROWS.length * rowHeight;
  const top = (renderHeight - patternHeight) / 2;

  COLOR_LINEARITY_ROWS.forEach((row, index) => {
    const y = top + index * rowHeight;
    drawBidirectionalColorBand(context, marginX, y, patternWidth, rowHeight, row);

    context.fillStyle = 'rgba(255,255,255,0.18)';
    context.fillRect(marginX, y + rowHeight / 2 - 1, patternWidth, 2);
    context.strokeStyle = 'rgba(0,0,0,0.36)';
    context.lineWidth = 2;
    context.strokeRect(marginX, y, patternWidth, rowHeight);
  });
}

function ColorLinearityPattern({ messages }: { messages: Messages }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(COLOR_LINEARITY_PATTERN_WIDTH * dpr));
      canvas.height = Math.max(1, Math.floor(COLOR_LINEARITY_PATTERN_HEIGHT * dpr));
      canvas.style.width = `${COLOR_LINEARITY_PATTERN_WIDTH}px`;
      canvas.style.height = `${COLOR_LINEARITY_PATTERN_HEIGHT}px`;

      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      drawColorLinearityPattern(context);
    };

    draw();

    return undefined;
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full bg-black" aria-label={messages.panel.colorLinearityPatternAria} />;
}

function drawColorLinearityPattern(
  context: CanvasRenderingContext2D,
  renderWidth = COLOR_LINEARITY_PATTERN_WIDTH,
  renderHeight = COLOR_LINEARITY_PATTERN_HEIGHT,
) {
  context.fillStyle = '#000';
  context.fillRect(0, 0, renderWidth, renderHeight);

  const rowHeight = 132;
  const patternHeight = COLOR_LINEARITY_ROWS.length * rowHeight;
  const top = (COLOR_LINEARITY_PATTERN_HEIGHT - patternHeight) / 2;
  const leftWidth = 575;
  const logoWidth = 420;
  const rightWidth = 575;
  const totalWidth = leftWidth + logoWidth + rightWidth;
  const leftX = (COLOR_LINEARITY_PATTERN_WIDTH - totalWidth) / 2;
  const logoX = leftX + leftWidth;
  const rightX = logoX + logoWidth;

  COLOR_LINEARITY_ROWS.forEach((row, index) => {
    const y = top + index * rowHeight;
    drawPaperComparisonRamp(context, leftX, y, leftWidth, rowHeight, row, false);
    drawColorLinearityLogoBlock(context, logoX, y, logoWidth, rowHeight, row);
    drawPaperComparisonRamp(context, rightX, y, rightWidth, rowHeight, row, true);

    context.strokeStyle = 'rgba(0,0,0,0.34)';
    context.lineWidth = 1.5;
    context.strokeRect(leftX, y, totalWidth, rowHeight);
  });
}

function InspectionModeHeader({
  title,
  subtitle,
  settings,
  setSettings,
  onClose,
  dragHandlers,
  messages,
}: {
  title: string;
  subtitle: string;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onClose: () => void;
  dragHandlers: PointerHandlers;
  messages: Messages;
}) {
  return (
    <div
      className="gsdf-inspection-header shrink-0 cursor-grab select-none border-b border-white/10 bg-[#0c1014] px-4 py-3 active:cursor-grabbing"
      {...dragHandlers}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-zinc-100">{title}</div>
          <div className="font-mono text-[9px] text-zinc-500">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2" data-no-drag>
          <button
            type="button"
            title={messages.panel.close}
            aria-label={messages.panel.close}
            onClick={onClose}
            className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 text-[10px] font-semibold text-zinc-400">
          {messages.panel.currentLuminanceValue}
        </span>
        <span className="min-w-[58px] text-right font-mono text-[18px] font-semibold leading-none tabular-nums text-[#ffffff]">
          {formatLuminance(settings.lmax)}
        </span>
        <span className="w-8 text-right font-mono text-[10px] text-zinc-500">{LUMINANCE_MIN_NITS}</span>
        <input
          type="range"
          min="0"
          max={LUMINANCE_SLIDER_MAX}
          step="1"
          value={luminanceToSliderValue(settings.lmax)}
          onChange={(event) => {
            setSettings((prev) => ({ ...prev, lmax: sliderValueToLuminance(event.target.value) }));
          }}
          className="gsdf-range flex-1"
        />
        <span className="w-8 text-left font-mono text-[10px] text-zinc-500">{LUMINANCE_MAX_NITS}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">nits</span>
      </div>
    </div>
  );
}

function getInspectionTitle(mode: SidePanelMode, messages: Messages): string {
  if (mode === 'pattern') {
    return messages.panel.patternTitle;
  }
  if (mode === 'linearity') {
    return messages.panel.colorLinearityTitle;
  }
  if (mode === 'bidirectional') {
    return messages.panel.bidirectionalColorTitle;
  }
  return messages.panel.chartTitle;
}

function getInspectionSubtitle(mode: SidePanelMode, messages: Messages): string {
  if (mode === 'pattern') {
    return messages.panel.patternSubtitle;
  }
  if (mode === 'linearity') {
    return messages.panel.colorLinearitySubtitle;
  }
  if (mode === 'bidirectional') {
    return messages.panel.bidirectionalColorSubtitle;
  }
  return messages.panel.chartSubtitle;
}

function getOpenFullInspectionLabel(mode: SidePanelMode, messages: Messages): string {
  if (mode === 'pattern') {
    return messages.panel.openFullPattern;
  }
  if (mode === 'linearity') {
    return messages.panel.openFullColorLinearity;
  }
  if (mode === 'bidirectional') {
    return messages.panel.openFullBidirectionalColor;
  }
  return messages.panel.openFullChart;
}

function InspectionModeView({
  mode,
  settings,
  setSettings,
  onClose,
  panelTheme,
  dragHandlers,
  resizeHandlers,
  messages,
}: {
  mode: Exclude<InspectionMode, null>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onClose: () => void;
  panelTheme: PanelTheme;
  dragHandlers: PointerHandlers;
  resizeHandlers: PointerHandlers;
  messages: Messages;
}) {
  return (
    <div className={`gsdf-inspection-mode gsdf-inspection-mode--${mode} flex h-full min-h-0 flex-col overflow-hidden`}>
      <InspectionModeHeader
        title={getInspectionTitle(mode, messages)}
        subtitle={getInspectionSubtitle(mode, messages)}
        settings={settings}
        setSettings={setSettings}
        onClose={onClose}
        dragHandlers={dragHandlers}
        messages={messages}
      />
      {mode === 'pattern' ? (
        <InteractiveInspectionViewport
          designWidth={DIAGNOSTIC_PATTERN_WIDTH}
          designHeight={DIAGNOSTIC_PATTERN_HEIGHT}
          className="bg-black p-2"
          ariaLabel={messages.panel.diagnosticPatternAria}
          messages={messages}
        >
          <FullDiagnosticPattern settings={settings} messages={messages} fixedDesignSize />
        </InteractiveInspectionViewport>
      ) : mode === 'linearity' ? (
        <InteractiveInspectionViewport
          designWidth={COLOR_LINEARITY_PATTERN_WIDTH}
          designHeight={COLOR_LINEARITY_PATTERN_HEIGHT}
          className="bg-black p-2"
          ariaLabel={messages.panel.colorLinearityPatternAria}
          messages={messages}
        >
          <ColorLinearityPattern messages={messages} />
        </InteractiveInspectionViewport>
      ) : mode === 'bidirectional' ? (
        <InteractiveInspectionViewport
          designWidth={BIDIRECTIONAL_COLOR_PATTERN_WIDTH}
          designHeight={BIDIRECTIONAL_COLOR_PATTERN_HEIGHT}
          className="bg-black p-2"
          ariaLabel={messages.panel.bidirectionalPatternAria}
          messages={messages}
        >
          <ColorBidirectionalPattern messages={messages} />
        </InteractiveInspectionViewport>
      ) : (
        <InteractiveInspectionViewport
          designWidth={CHART_VIEW_WIDTH}
          designHeight={CHART_VIEW_HEIGHT}
          className="bg-[#10151b] p-4"
          ariaLabel={messages.panel.chartTitle}
          messages={messages}
        >
          <div className="h-full w-full rounded-md border border-white/10 bg-[#080b0f] p-3">
            <React.Suspense fallback={<div className="h-full min-h-[240px]" />}>
              <GSDFChart settings={settings} panelTheme={panelTheme} messages={messages} className="h-full min-h-0" />
            </React.Suspense>
          </div>
        </InteractiveInspectionViewport>
      )}
      <div
        className="gsdf-resize-grip absolute right-1.5 bottom-1.5 z-10 h-5 w-5 cursor-nwse-resize rounded-sm border-r border-b border-white/35 opacity-70 transition-opacity hover:opacity-100"
        title={messages.panel.resizeView}
        aria-label={messages.panel.resizeView}
        role="separator"
        data-no-drag
        {...resizeHandlers}
      />
    </div>
  );
}

function PanelBorderResizeHandles({
  getResizeHandlers,
  messages,
}: {
  getResizeHandlers: (handle: ResizeHandle) => PointerHandlers;
  messages: Messages;
}) {
  return (
    <>
      <div
        className="gsdf-resize-edge gsdf-resize-edge--right absolute top-16 right-0 bottom-8 z-20 w-2 cursor-ew-resize"
        title={messages.panel.resizePanelWidth}
        aria-label={messages.panel.resizePanelWidth}
        role="separator"
        data-no-drag
        data-resize-handle="e"
        {...getResizeHandlers('e')}
      />
      <div
        className="gsdf-resize-edge gsdf-resize-edge--bottom absolute right-8 bottom-0 left-8 z-20 h-2 cursor-ns-resize"
        title={messages.panel.resizePanelHeight}
        aria-label={messages.panel.resizePanelHeight}
        role="separator"
        data-no-drag
        data-resize-handle="s"
        {...getResizeHandlers('s')}
      />
      <div
        className="gsdf-resize-grip absolute right-1.5 bottom-1.5 z-30 h-5 w-5 cursor-nwse-resize rounded-sm border-r border-b border-white/35 opacity-70 transition-opacity hover:opacity-100"
        title={messages.panel.resizePanelCorner}
        aria-label={messages.panel.resizePanelCorner}
        role="separator"
        data-no-drag
        data-resize-handle="se"
        {...getResizeHandlers('se')}
      />
    </>
  );
}

function ReferenceSidePanel({
  mode,
  settings,
  panelTheme,
  messages,
  onModeChange,
  onOpenFull,
  onClose,
}: {
  mode: SidePanelMode;
  settings: AppSettings;
  panelTheme: PanelTheme;
  messages: Messages;
  onModeChange: (mode: SidePanelMode) => void;
  onOpenFull: (mode: SidePanelMode) => void;
  onClose: () => void;
}) {
  return (
    <aside className="gsdf-reference-panel flex min-h-0 flex-col overflow-hidden border-l border-white/10 bg-[#0a0d12]">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3" data-no-drag>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold text-zinc-200">{messages.panel.referenceSummaryTitle}</div>
          <div className="truncate font-mono text-[9px] text-zinc-500">
            {messages.panel.sidePanelTitle}
          </div>
        </div>
        <button
          type="button"
          title={messages.panel.closeSidePanel}
          aria-label={messages.panel.closeSidePanel}
          onClick={onClose}
          className="gsdf-icon-button flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
        >
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="grid shrink-0 grid-cols-4 gap-1 border-b border-white/10 p-3" data-no-drag>
        {([
          { value: 'pattern', label: messages.panel.referencePanel, icon: <Grid3X3 size={13} /> },
          { value: 'linearity', label: messages.panel.colorLinearityPanel, icon: <Palette size={13} /> },
          { value: 'bidirectional', label: messages.panel.bidirectionalColorPanel, icon: <Palette size={13} /> },
          { value: 'chart', label: messages.panel.curvePanel, icon: <BarChart3 size={13} /> },
        ] as Array<{ value: SidePanelMode; label: string; icon: React.ReactNode }>).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => onModeChange(option.value)}
            className={`gsdf-segment-button flex h-8 items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold transition-colors ${
              mode === option.value
                ? 'bg-zinc-100 text-[#111418]'
                : 'border border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-100'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
      <p className="shrink-0 border-b border-white/10 px-3 py-3 text-[12px] leading-5 text-zinc-400">
        {messages.panel.referenceSummaryBody}
      </p>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {mode === 'pattern' ? (
          <div className="h-full min-h-0 overflow-hidden rounded-md border border-white/10 bg-black p-2">
            <FullDiagnosticPattern settings={settings} messages={messages} />
          </div>
        ) : mode === 'linearity' ? (
          <div className="h-full min-h-0 overflow-hidden rounded-md border border-white/10 bg-black p-2">
            <ColorLinearityPattern messages={messages} />
          </div>
        ) : mode === 'bidirectional' ? (
          <div className="h-full min-h-0 overflow-hidden rounded-md border border-white/10 bg-black p-2">
            <ColorBidirectionalPattern messages={messages} />
          </div>
        ) : (
          <div className="h-full min-h-0 rounded-md border border-white/10 bg-[#080b0f] p-3">
            <React.Suspense fallback={<div className="h-full min-h-[180px]" />}>
              <GSDFChart settings={settings} panelTheme={panelTheme} messages={messages} className="h-full min-h-[180px]" />
            </React.Suspense>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-white/10 p-3" data-no-drag>
        <button
          type="button"
          title={getOpenFullInspectionLabel(mode, messages)}
          onClick={() => onOpenFull(mode)}
          className="gsdf-text-button flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-[#0b0d10] px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
        >
          <Maximize2 size={13} />
          {getOpenFullInspectionLabel(mode, messages)}
        </button>
      </div>
    </aside>
  );
}

function LanguageSelector({
  locale,
  messages,
  onLocaleChange,
}: {
  locale: SupportedLocale;
  messages: Messages;
  onLocaleChange: (locale: SupportedLocale) => void;
}) {
  return (
    <label
      title={messages.language.label}
      className="gsdf-text-button flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-[#0b0d10] px-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
      data-no-drag
    >
      <Languages size={14} />
      <select
        aria-label={messages.language.label}
        value={locale}
        onChange={(event) => onLocaleChange(event.target.value as SupportedLocale)}
      className="max-w-[112px] bg-transparent text-[11px] font-semibold text-inherit outline-none"
      >
        {supportedLocales.map((option) => (
          <option key={option} value={option}>
            {localeNames[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DraggablePanel({
  settings,
  setSettings,
  locale,
  messages,
  onLocaleChange,
  extensionMode = false,
  onExtensionDrag,
  onExtensionResize,
  onExtensionClose,
}: DraggablePanelProps) {
  const dragControls = useDragControls();
  const dragStartRef = React.useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const resizeStartRef = React.useRef<{ pointerId: number; x: number; y: number; handle: ResizeHandle } | null>(null);
  const [activeTab, setActiveTab] = React.useState<PanelTab>('basic');
  const [sidePanelOpen, setSidePanelOpen] = React.useState(false);
  const [sidePanelMode, setSidePanelMode] = React.useState<SidePanelMode>('pattern');
  const [inspectionMode, setInspectionMode] = React.useState<InspectionMode>(null);
  const [panelClosed, setPanelClosed] = React.useState(false);
  const [standaloneInspectionSize, setStandaloneInspectionSize] = React.useState(() => getDefaultInspectionSize());
  const [standalonePanelSize, setStandalonePanelSize] = React.useState(() => getDefaultPanelSize());
  const [panelTheme, setPanelTheme] = React.useState<PanelTheme>(() => {
    const savedTheme = localStorage.getItem(PANEL_THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  useExpandedOverlayViewport(inspectionMode !== null || sidePanelOpen);

  React.useEffect(() => {
    localStorage.setItem(PANEL_THEME_STORAGE_KEY, panelTheme);
  }, [panelTheme]);

  React.useEffect(() => {
    if (extensionMode || !inspectionMode) {
      return;
    }

    setStandaloneInspectionSize(getDefaultInspectionSize());
  }, [extensionMode, inspectionMode]);

  const toggleEnabled = () => {
    setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  const applyOptimizedPreset = () => {
    setSettings((prev) => ({
      ...prev,
      ...getRecommendedImageDefaults(100),
      enabled: true,
      lmax: 100,
      gammaTarget: DEFAULT_GAMMA_TARGET,
      strength: DEFAULT_APP_SETTINGS.strength,
      sourceIsLinear: DEFAULT_APP_SETTINGS.sourceIsLinear,
      fineSharpness: DEFAULT_APP_SETTINGS.fineSharpness,
      mediumSharpness: DEFAULT_APP_SETTINGS.mediumSharpness,
      temperature: DEFAULT_APP_SETTINGS.temperature,
      grayscale: DEFAULT_APP_SETTINGS.grayscale,
      hue: DEFAULT_APP_SETTINGS.hue,
    }));
  };

  const setLmaxWithLinkedDefaults = (nextLmax: number) => {
    setSettings((prev) => {
      const currentRecommended = getRecommendedImageDefaults(prev.lmax);
      const nextRecommended = getRecommendedImageDefaults(nextLmax);
      const next = { ...prev, lmax: nextLmax };

      if (prev.blackPoint === currentRecommended.blackPoint) {
        next.blackPoint = nextRecommended.blackPoint;
      }
      if (prev.whitePoint === currentRecommended.whitePoint) {
        next.whitePoint = nextRecommended.whitePoint;
      }
      if (prev.displayGamut === currentRecommended.displayGamut) {
        next.displayGamut = nextRecommended.displayGamut;
      }
      if (prev.saturation === currentRecommended.saturation) {
        next.saturation = nextRecommended.saturation;
      }

      return next;
    });
  };

  const handleLmaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLmaxWithLinkedDefaults(sliderValueToLuminance(e.target.value));
  };

  const setDisplayGamut = (value: AppSettings['displayGamut']) => {
    setSettings((prev) => ({ ...prev, displayGamut: value }));
  };

  const setNumericSetting = (
    key: keyof Pick<AppSettings, 'gammaTarget' | 'strength' | 'blackPoint' | 'whitePoint' | 'fineSharpness' | 'mediumSharpness' | 'temperature' | 'saturation' | 'hue'>,
    value: number,
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'blackPoint' && next.whitePoint <= value) {
        next.whitePoint = Math.min(WHITE_CLIP_TONE_MAX, value + 1);
      }
      if (key === 'whitePoint' && value <= next.blackPoint) {
        next.blackPoint = Math.max(BLACK_CLIP_TONE_MIN, value - 1);
      }
      return next;
    });
  };

  const setBooleanSetting = (
    key: keyof Pick<AppSettings, 'sourceIsLinear' | 'grayscale'>,
    value: boolean,
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefault = () => {
    setSettings((prev) => ({ ...DEFAULT_APP_SETTINGS, enabled: prev.enabled }));
  };
  const handlePanelClose = () => {
    if (extensionMode) {
      onExtensionClose?.();
      return;
    }

    setPanelClosed(true);
  };
  const gammaCorrection = gammaTargetToCorrection(settings.gammaTarget);
  const setGammaCorrection = (value: number) => {
    setNumericSetting('gammaTarget', gammaCorrectionToTarget(value));
  };

  React.useEffect(() => {
    if (extensionMode || inspectionMode) {
      return;
    }

    setStandalonePanelSize((current) => clampStandalonePanelSize({
      width: sidePanelOpen ? Math.max(current.width, PANEL_SIDE_PANEL_WIDTH) : Math.min(current.width, PANEL_DEFAULT_WIDTH),
      height: current.height,
    }, sidePanelOpen));
  }, [extensionMode, inspectionMode, sidePanelOpen]);

  React.useEffect(() => {
    if (!extensionMode || inspectionMode) {
      return;
    }

    postPanelLayoutRequest(
      sidePanelOpen ? PANEL_SIDE_PANEL_WIDTH : PANEL_DEFAULT_WIDTH,
      PANEL_DEFAULT_HEIGHT,
    );
  }, [extensionMode, inspectionMode, sidePanelOpen]);

  const renderBasicPanel = () => (
    <div className="space-y-3">
      <div className={`transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-75'}`}>
        <StatusDeck
          settings={settings}
          onLmaxChange={handleLmaxChange}
          onResetLmax={() => setLmaxWithLinkedDefaults(DEFAULT_TARGET_LUMINANCE_NITS)}
          onResetDefault={resetToDefault}
          messages={messages}
        />
      </div>

      <SliderControl
        icon={<Activity size={14} />}
        label={messages.panel.gammaLabel}
        title={messages.panel.gammaTitle}
        valueText={`${gammaCorrection > 0 ? '+' : ''}${gammaCorrection} · γ ${settings.gammaTarget.toFixed(1)}`}
        valueVariant="label"
        minLabel="-100"
        maxLabel="+100"
        min={0}
        max={LUMINANCE_SLIDER_MAX}
        value={gammaCorrectionToAlignedSliderValue(gammaCorrection)}
        className="gsdf-gamma-control"
        rangeRowClassName="pr-11"
        calibratedRange
        marks={[
          { value: gammaTargetToAlignedSliderValue(2.2), label: '2.2', tone: 'major' },
          { value: gammaTargetToAlignedSliderValue(2.4), label: '2.4', tone: 'major' },
          { value: gammaTargetToAlignedSliderValue(2.6), label: '2.6', tone: 'major' },
        ]}
        resetTitle={messages.panel.resetTitle}
        onReset={() => {
          setNumericSetting('gammaTarget', DEFAULT_GAMMA_TARGET);
          setBooleanSetting('sourceIsLinear', DEFAULT_APP_SETTINGS.sourceIsLinear);
        }}
        headerAddon={(
          <label
            title={messages.panel.sourceLinearTitle}
            className="gsdf-inline-checkbox flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-zinc-400"
          >
            <span>{messages.panel.sourceLinearShort}</span>
            <input
              type="checkbox"
              checked={settings.sourceIsLinear}
              onChange={(event) => setBooleanSetting('sourceIsLinear', event.target.checked)}
              aria-label={messages.panel.sourceLinear}
              className="gsdf-checkbox h-4 w-4 shrink-0"
            />
          </label>
        )}
        onChange={(value) => setGammaCorrection(alignedSliderValueToGammaCorrection(value))}
      />

      <SliderControl
        icon={<Gauge size={14} />}
        label={messages.panel.filterLabel}
        title={messages.panel.filterTitle}
        valueText={`${settings.strength}%`}
        valueVariant="label"
        minLabel="0"
        maxLabel="100"
        min={0}
        max={100}
        step={5}
        value={settings.strength}
        className="gsdf-filter-control"
        rangeRowClassName="pr-11"
        calibratedRange
        resetTitle={messages.panel.resetTitle}
        onReset={() => setNumericSetting('strength', DEFAULT_APP_SETTINGS.strength)}
        onChange={(value) => setNumericSetting('strength', value)}
      />

      <section className="gsdf-control-block gsdf-basic-curve-block space-y-2.5">
        <div className="gsdf-control-headline">
          <div className="gsdf-control-label flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
            <span className="gsdf-control-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
              <BarChart3 size={14} />
            </span>
            <span className="truncate">{messages.panel.curvePanel}</span>
          </div>
          <button
            type="button"
            title={messages.panel.openFullChart}
            onClick={() => setInspectionMode('chart')}
            className="gsdf-control-reset flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            data-no-drag
          >
            <Maximize2 size={13} />
          </button>
        </div>
        <div className="min-h-0 rounded-md border border-white/10 bg-[#080b0f] p-2">
          <React.Suspense fallback={<div className="h-[158px]" />}>
            <GSDFChart settings={settings} panelTheme={panelTheme} messages={messages} className="h-[158px]" />
          </React.Suspense>
        </div>
      </section>
    </div>
  );

  const renderAdvancedPanel = () => {
    const remainingToneCount = Math.max(0, settings.whitePoint - settings.blackPoint);

    return (
    <div className="grid min-h-0 grid-cols-2 gap-3 max-[760px]:grid-cols-1">
      <SegmentedControl
        disabled={!settings.enabled}
        icon={<BarChart3 size={14} />}
        label={messages.panel.displayGamut}
        value={settings.displayGamut}
        options={[
          { value: 'srgb', label: 'sRGB', title: messages.panel.srgbGamutTitle },
          { value: 'display-p3', label: 'Display P3', title: messages.panel.displayP3GamutTitle },
          { value: 'adobe-rgb', label: 'Adobe RGB', title: messages.panel.adobeRgbGamutTitle },
        ]}
        resetTitle={messages.panel.resetTitle}
        onReset={() => setDisplayGamut(DEFAULT_APP_SETTINGS.displayGamut)}
        onChange={(value) => setDisplayGamut(value)}
      />

      <div className={`gsdf-tone-pair grid grid-cols-2 gap-3 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
        <SliderControl
          icon={<SlidersHorizontal size={14} />}
          label={messages.panel.blackPoint}
          title={messages.panel.clipTonesTitle}
          valueText={`${settings.blackPoint} · ${remainingToneCount}/${TONE_LEVEL_COUNT}`}
          minLabel={String(BLACK_CLIP_TONE_MIN)}
          maxLabel={String(BLACK_CLIP_TONE_MAX)}
          min={BLACK_CLIP_TONE_MIN}
          max={BLACK_CLIP_TONE_MAX}
          step={1}
          value={settings.blackPoint}
          resetTitle={messages.panel.resetTitle}
          onReset={() => setNumericSetting('blackPoint', getRecommendedImageDefaults(settings.lmax).blackPoint)}
          onChange={(value) => setNumericSetting('blackPoint', value)}
        />
        <SliderControl
          icon={<Sun size={14} />}
          label={messages.panel.whitePoint}
          title={messages.panel.clipTonesTitle}
          valueText={`${settings.whitePoint} · ${remainingToneCount}/${TONE_LEVEL_COUNT}`}
          minLabel={String(WHITE_CLIP_TONE_MIN)}
          maxLabel={String(WHITE_CLIP_TONE_MAX)}
          min={WHITE_CLIP_TONE_MIN}
          max={WHITE_CLIP_TONE_MAX}
          step={1}
          value={settings.whitePoint}
          resetTitle={messages.panel.resetTitle}
          onReset={() => setNumericSetting('whitePoint', getRecommendedImageDefaults(settings.lmax).whitePoint)}
          onChange={(value) => setNumericSetting('whitePoint', value)}
        />
      </div>

      <SliderControl
        disabled={!settings.enabled}
        icon={<SlidersHorizontal size={14} />}
        label={messages.panel.fineDetailSharpening}
        valueText={`${settings.fineSharpness}%`}
        minLabel="0"
        maxLabel="50"
        min={0}
        max={50}
        step={1}
        value={settings.fineSharpness}
        resetTitle={messages.panel.resetTitle}
        onReset={() => setNumericSetting('fineSharpness', DEFAULT_APP_SETTINGS.fineSharpness)}
        onChange={(value) => setNumericSetting('fineSharpness', value)}
      />

      <SliderControl
        disabled={!settings.enabled}
        icon={<SlidersHorizontal size={14} />}
        label={messages.panel.mediumDetailSharpening}
        valueText={`${settings.mediumSharpness}%`}
        minLabel="0"
        maxLabel="40"
        min={0}
        max={40}
        step={1}
        value={settings.mediumSharpness}
        resetTitle={messages.panel.resetTitle}
        onReset={() => setNumericSetting('mediumSharpness', DEFAULT_APP_SETTINGS.mediumSharpness)}
        onChange={(value) => setNumericSetting('mediumSharpness', value)}
      />

      <SliderControl
        disabled={!settings.enabled}
        icon={<Thermometer size={14} />}
        label={messages.panel.temperatureShift}
        valueText={settings.temperature === 0 ? '0K' : settings.temperature > 0 ? `+${settings.temperature}K` : `${settings.temperature}K`}
        minLabel="-1000"
        maxLabel="+1000"
        min={TEMPERATURE_MIN_K}
        max={TEMPERATURE_MAX_K}
        step={50}
        value={settings.temperature}
        resetTitle={messages.panel.resetTitle}
        onReset={() => setNumericSetting('temperature', DEFAULT_APP_SETTINGS.temperature)}
        onChange={(value) => setNumericSetting('temperature', value)}
      />

      <SliderControl
        disabled={!settings.enabled}
        icon={<Palette size={14} />}
        label={messages.panel.saturation}
        valueText={`${settings.saturation}%`}
        minLabel={String(SATURATION_MIN)}
        maxLabel={String(SATURATION_MAX)}
        min={SATURATION_MIN}
        max={SATURATION_MAX}
        step={5}
        value={settings.saturation}
        resetTitle={messages.panel.resetTitle}
        onReset={() => {
          setNumericSetting('saturation', getRecommendedImageDefaults(settings.lmax).saturation);
          setBooleanSetting('grayscale', DEFAULT_APP_SETTINGS.grayscale);
        }}
        headerAddon={(
          <label
            title={messages.panel.grayscaleTitle}
            className="gsdf-inline-checkbox flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-zinc-400"
          >
            <span>{messages.panel.grayscale}</span>
            <input
              type="checkbox"
              checked={settings.grayscale}
              disabled={!settings.enabled}
              onChange={(event) => setBooleanSetting('grayscale', event.target.checked)}
              aria-label={messages.panel.grayscale}
              className="gsdf-checkbox h-4 w-4 shrink-0"
            />
          </label>
        )}
        onChange={(value) => setNumericSetting('saturation', value)}
      />

      <SliderControl
        disabled={!settings.enabled}
        icon={<Activity size={14} />}
        label={messages.panel.hue}
        valueText={settings.hue === 0 ? '0' : settings.hue > 0 ? `+${settings.hue}` : String(settings.hue)}
        minLabel="-30"
        maxLabel="+30"
        min={-30}
        max={30}
        step={5}
        value={settings.hue}
        resetTitle={messages.panel.resetTitle}
        onReset={() => setNumericSetting('hue', DEFAULT_APP_SETTINGS.hue)}
        onChange={(value) => setNumericSetting('hue', value)}
      />
    </div>
    );
  };

  const renderDiagnosticPlaceholder = () => (
    <div className="space-y-3">
      <DiagnosticCameraProbe settings={settings} setSettings={setSettings} messages={messages} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setSidePanelMode('pattern');
            setSidePanelOpen(true);
          }}
          className="gsdf-text-button flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[11px] font-semibold text-zinc-200 transition-colors hover:text-zinc-50"
        >
          <Grid3X3 size={13} />
          {messages.panel.referencePanel}
        </button>
        <button
          type="button"
          onClick={() => {
            setSidePanelMode('linearity');
            setSidePanelOpen(true);
          }}
          className="gsdf-text-button flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[11px] font-semibold text-zinc-200 transition-colors hover:text-zinc-50"
        >
          <Palette size={13} />
          {messages.panel.colorLinearityPanel}
        </button>
        <button
          type="button"
          onClick={() => {
            setSidePanelMode('chart');
            setSidePanelOpen(true);
          }}
          className="gsdf-text-button flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[11px] font-semibold text-zinc-200 transition-colors hover:text-zinc-50"
        >
          <BarChart3 size={13} />
          {messages.panel.curvePanel}
        </button>
      </div>
    </div>
  );

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveDragTarget(e.target)) {
      return;
    }

    if (!extensionMode) {
      dragControls.start(e);
      return;
    }

    e.preventDefault();
    dragStartRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    trySetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!extensionMode || !dragStartRef.current || dragStartRef.current.pointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    onExtensionDrag?.(deltaX, deltaY);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId === e.pointerId) {
      tryReleasePointerCapture(e.currentTarget, e.pointerId);
    }
    dragStartRef.current = null;
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle = 'se') => {
    e.stopPropagation();
    e.preventDefault();
    resizeStartRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, handle };
    trySetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current || resizeStartRef.current.pointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    const currentResize = resizeStartRef.current;
    const { deltaWidth, deltaHeight } = getResizeDeltas(
      currentResize.handle,
      e.clientX - currentResize.x,
      e.clientY - currentResize.y,
    );
    resizeStartRef.current = { ...currentResize, x: e.clientX, y: e.clientY };

    if (!extensionMode) {
      if (inspectionMode) {
        setStandaloneInspectionSize((current) => ({
          width: clampValue(current.width + deltaWidth, INSPECTION_MIN_WIDTH, Math.max(INSPECTION_MIN_WIDTH, window.innerWidth - 16)),
          height: clampValue(current.height + deltaHeight, INSPECTION_MIN_HEIGHT, Math.max(INSPECTION_MIN_HEIGHT, window.innerHeight - 16)),
        }));
        return;
      }

      setStandalonePanelSize((current) => clampStandalonePanelSize({
        width: current.width + deltaWidth,
        height: current.height + deltaHeight,
      }, sidePanelOpen));
      return;
    }

    onExtensionResize?.(deltaWidth, deltaHeight);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeStartRef.current?.pointerId === e.pointerId) {
      tryReleasePointerCapture(e.currentTarget, e.pointerId);
    }
    resizeStartRef.current = null;
  };

  const dragHandlers = {
    onPointerDown: handleHeaderPointerDown,
    onPointerMove: handleHeaderPointerMove,
    onPointerUp: handleHeaderPointerUp,
    onPointerCancel: handleHeaderPointerUp,
  };
  const getResizeHandlers = (handle: ResizeHandle) => ({
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => handleResizePointerDown(event, handle),
    onPointerMove: handleResizePointerMove,
    onPointerUp: handleResizePointerUp,
    onPointerCancel: handleResizePointerUp,
  });
  const resizeHandlers = getResizeHandlers('se');
  const panelSizeClass = inspectionMode
    ? `${extensionMode ? 'relative h-screen w-screen max-h-screen' : 'absolute h-[720px] max-h-[calc(100vh-16px)] w-[960px] max-w-[calc(100vw-16px)]'}`
    : extensionMode
      ? 'relative h-screen w-screen'
      : 'absolute max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)]';
  const panelStyle = !extensionMode
    ? inspectionMode
      ? { width: standaloneInspectionSize.width, height: standaloneInspectionSize.height }
      : { width: standalonePanelSize.width, height: standalonePanelSize.height }
    : undefined;

  if (panelClosed) {
    return null;
  }

  return (
    <motion.div
      drag={!extensionMode}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={extensionMode ? false : { x: 24, y: 24 }}
      style={panelStyle}
      data-panel-theme={panelTheme}
      className={`${panelSizeClass} gsdf-panel gsdf-panel-shell theme-${panelTheme} top-0 left-0 z-50 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111418] font-sans text-zinc-200 shadow-2xl`}
    >
      {inspectionMode ? (
        <InspectionModeView
          mode={inspectionMode}
          settings={settings}
          setSettings={setSettings}
          panelTheme={panelTheme}
          onClose={() => setInspectionMode(null)}
          dragHandlers={dragHandlers}
          resizeHandlers={resizeHandlers}
          messages={messages}
        />
      ) : (
        <>
          <div
            className="gsdf-panel-header cursor-grab select-none space-y-3 border-b border-white/10 bg-[#181c21] px-4 py-2.5 active:cursor-grabbing"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onPointerCancel={handleHeaderPointerUp}
          >
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="gsdf-header-emblem flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-zinc-200">
                  <Settings size={16} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-white">LumaLift</div>
                  <div className="truncate font-mono text-[9px] tracking-[0.08em] text-zinc-500">GSDF EOTF Adjuster · {messages.panel.subtitle}</div>
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center justify-end gap-2" data-no-drag>
                <button
                  type="button"
                  title={messages.panel.toggleSidePanel}
                  aria-label={messages.panel.toggleSidePanel}
                  aria-pressed={sidePanelOpen}
                  onClick={() => setSidePanelOpen((value) => !value)}
                  className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  {sidePanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                </button>
                <button
                  type="button"
                  title={panelTheme === 'light' ? messages.panel.switchToDark : messages.panel.switchToLight}
                  aria-label={panelTheme === 'light' ? messages.panel.switchToDark : messages.panel.switchToLight}
                  onClick={() => setPanelTheme((theme) => (theme === 'light' ? 'dark' : 'light'))}
                  className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  {panelTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                </button>
                <button
                  type="button"
                  title={messages.panel.closePanel}
                  aria-label={messages.panel.closePanel}
                  onClick={handlePanelClose}
                  className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="gsdf-nav-row flex min-w-0 flex-wrap items-center justify-between gap-2" data-no-drag>
              <PanelTabSwitch value={activeTab} onChange={setActiveTab} panelTheme={panelTheme} messages={messages} />
              <LanguageSelector locale={locale} messages={messages} onLocaleChange={onLocaleChange} />
            </div>
            <div className="gsdf-header-controls flex shrink-0 flex-wrap items-center justify-start gap-[5px]" data-no-drag>
              <button
                type="button"
                onClick={toggleEnabled}
                aria-pressed={settings.enabled}
                aria-label={messages.panel.enableEotf}
                title={messages.panel.enableEotf}
                className="gsdf-power-cluster flex min-w-0 items-center justify-start gap-[5px] rounded-md border border-white/10 bg-[#080b0f] p-1.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden="true"
                  data-state={settings.enabled ? 'on' : 'off'}
                  className="gsdf-effect-switch relative inline-flex h-8 w-14 shrink-0 items-center rounded-md border border-white/10 bg-[#0b0d10] p-1 transition-colors"
                >
                  <span className={`pointer-events-none absolute inset-1 rounded transition-colors ${settings.enabled ? 'bg-white/[0.10]' : 'bg-white/[0.04]'}`} />
                  <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded text-[#0b0d10] transition-transform ${settings.enabled ? 'translate-x-6 bg-zinc-100' : 'translate-x-0 bg-zinc-500'}`}>
                    <Power size={13} />
                  </span>
                </span>
                <span className="gsdf-power-status flex h-[30px] w-[78px] min-w-0 flex-col items-start justify-center px-px py-0.5">
                  <span className={`truncate text-[10px] font-semibold uppercase tracking-[0.12em] ${settings.enabled ? 'text-zinc-100' : 'text-zinc-400'}`}>
                    {settings.enabled ? messages.panel.active : messages.panel.standby}
                  </span>
                  <span className="truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {settings.enabled ? messages.panel.effectOn : messages.panel.effectOff}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={applyOptimizedPreset}
                title={messages.panel.optimizePresetTitle}
                className="gsdf-quick-action rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:text-zinc-50"
              >
                {messages.panel.optimizePreset}
              </button>
              <div className="gsdf-header-metrics flex min-w-0 flex-1 flex-wrap items-center justify-end gap-[5px]">
                <ModePill tone={settings.enabled ? 'active' : 'neutral'} title={messages.panel.gsdfMixTitle}>
                  <MonitorUp size={13} />
                  GSDF
                </ModePill>
                <ModePill title={messages.panel.gammaPillTitle}>
                  <Activity size={13} />
                  <span className="gsdf-pill-label">gamma</span>
                  <span className="gsdf-pill-metric">{settings.gammaTarget.toFixed(1)}</span>
                </ModePill>
                <ModePill title={messages.panel.filterPillTitle}>
                  <Gauge size={13} />
                  <span className="gsdf-pill-label">mix</span>
                  <span className="gsdf-pill-metric">{settings.strength}%</span>
                </ModePill>
              </div>
            </div>
          </div>

          <div className={`grid min-h-0 flex-1 ${sidePanelOpen ? 'grid-cols-1 min-[760px]:grid-cols-[minmax(0,1fr)_minmax(390px,0.92fr)]' : 'grid-cols-1'}`}>
            <div className={`gsdf-primary-pane min-h-0 overflow-y-auto overflow-x-hidden p-4 ${sidePanelOpen ? 'max-[759px]:hidden' : ''}`}>
              <div hidden={activeTab !== 'basic'} aria-hidden={activeTab !== 'basic'}>
                {renderBasicPanel()}
              </div>
              <div hidden={activeTab !== 'advanced'} aria-hidden={activeTab !== 'advanced'}>
                {renderAdvancedPanel()}
              </div>
              <div hidden={activeTab !== 'diagnostic'} aria-hidden={activeTab !== 'diagnostic'}>
                {renderDiagnosticPlaceholder()}
              </div>
            </div>
            {sidePanelOpen && (
              <ReferenceSidePanel
                mode={sidePanelMode}
                settings={settings}
                panelTheme={panelTheme}
                messages={messages}
                onModeChange={setSidePanelMode}
                onOpenFull={setInspectionMode}
                onClose={() => setSidePanelOpen(false)}
              />
            )}
          </div>
          <PanelBorderResizeHandles getResizeHandlers={getResizeHandlers} messages={messages} />
        </>
      )}

    </motion.div>
  );
}
