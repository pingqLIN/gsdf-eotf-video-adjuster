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
  buildGsdfStripeRows,
  DEFAULT_APP_SETTINGS,
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
  sliderValueToLuminance,
} from '../types';
import { localeNames, supportedLocales, type Messages, type SupportedLocale } from '../i18n';
import { DiagnosticCameraProbe } from './DiagnosticCameraProbe';

const GSDFChart = React.lazy(() => import('./GSDFChart').then((module) => ({ default: module.GSDFChart })));

type PanelTab = 'basic' | 'advanced' | 'diagnostic';
type PanelTheme = 'dark' | 'light';
type InspectionMode = 'pattern' | 'chart' | null;
type SidePanelMode = 'pattern' | 'chart';
type ResizeHandle = 'e' | 's' | 'se';

const PANEL_THEME_STORAGE_KEY = 'gsdf_panel_theme';
const INSPECTION_MIN_WIDTH = 560;
const INSPECTION_MIN_HEIGHT = 420;
const INSPECTION_DEFAULT_WIDTH = 960;
const INSPECTION_DEFAULT_HEIGHT = 720;
const PANEL_DEFAULT_WIDTH = 400;
const PANEL_DEFAULT_HEIGHT = 680;
const PANEL_SIDE_PANEL_WIDTH = 800;
const PANEL_MIN_HEIGHT = 520;
const PANEL_MIN_WIDTH = 400;
const PANEL_VIEWPORT_MARGIN = 16;
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
  onChange: (value: number) => void;
}

interface SegmentedControlProps<T extends string> {
  icon?: React.ReactNode;
  label: string;
  value: T;
  options: Array<{ value: T; label: string; title: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}

interface PointerHandlers {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
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
    <span title={title} data-tone={tone} className={`gsdf-mode-pill inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-md border px-2.5 text-[10px] font-semibold ${toneClass}`}>
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
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={`gsdf-control-block space-y-2.5 transition-opacity ${disabled ? 'opacity-45 pointer-events-none' : 'opacity-100'}`}>
      <label className="gsdf-control-label flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
        <span className="gsdf-control-icon flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
          {icon ?? <SlidersHorizontal size={14} />}
        </span>
        {label}
      </label>
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
  onChange,
}: SliderControlProps) {
  const valueTextClass =
    valueVariant === 'label'
      ? 'w-24 text-right font-sans text-[11px] font-semibold text-zinc-300'
      : 'font-mono text-[16px] font-semibold tabular-nums text-zinc-100';

  return (
    <div className={`gsdf-control-block space-y-2.5 transition-opacity ${disabled ? 'opacity-45 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex items-center justify-between gap-3">
        <label title={title} className="gsdf-control-label flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="gsdf-control-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </label>
        <div className={`shrink-0 ${valueTextClass}`}>
          {valueText}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {minLabel && <span className="w-8 text-right font-mono text-[10px] text-zinc-500">{minLabel}</span>}
        <div className="flex flex-1 items-center">
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
        </div>
        {maxLabel && <span className="w-8 text-left font-mono text-[10px] text-zinc-500">{maxLabel}</span>}
      </div>
    </div>
  );
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, input, label, select, textarea, a, [role="button"], [data-no-drag]'));
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
  onResetDefault,
  messages,
}: {
  settings: AppSettings;
  onLmaxChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
        <input
          type="range"
          min="0"
          max={LUMINANCE_SLIDER_MAX}
          step="1"
          value={luminanceToSliderValue(settings.lmax)}
          onChange={onLmaxChange}
          className="gsdf-range w-full"
        />
        <div className="flex items-center justify-between px-1 font-mono text-[10px] text-zinc-500">
          <span>{LUMINANCE_MIN_NITS}</span>
          <span>{LUMINANCE_MAX_NITS}</span>
        </div>
      </div>
    </section>
  );
}

function FullDiagnosticPattern({
  settings,
  messages,
  zoom = 1,
}: {
  settings: AppSettings;
  messages: Messages;
  zoom?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
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

      const designWidth = 1800;
      const designHeight = 1200;
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
  }, [messages, settings, zoom]);

  return <canvas ref={canvasRef} className="h-full w-full bg-black" aria-label={messages.panel.diagnosticPatternAria} />;
}

function drawDiagnosticPattern(context: CanvasRenderingContext2D, settings: AppSettings, messages: Messages) {
  const width = 1800;
  const height = 1200;
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
  context.strokeStyle = '#808080';
  context.lineWidth = 2;
  context.strokeRect(18, 18, width - 36, height - 36);

  drawVerticalGradient(context, 52, 130, 140, 900, true);
  drawVerticalGradient(context, 1608, 130, 140, 900, false);
  drawLinePairBand(context, 250, 44, 1300, 72, false);
  drawLinePairBand(context, 250, 1084, 1300, 72, true);

  context.font = '22px Cascadia Mono, monospace';
  context.fillStyle = '#d6d6d6';
  context.fillText(messages.diagnosticPattern.title, 58, 76);
  context.font = '15px Cascadia Mono, monospace';
  context.fillStyle = '#9a9a9a';
  context.fillText(messages.diagnosticPattern.subtitle, 58, 104);

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

    context.font = '13px Cascadia Mono, monospace';
    context.fillStyle = gray > 128 ? '#111' : '#eee';
    context.fillText(String(gray).padStart(3, '0'), chartX + chartW / 2 - 18, y + rowH / 2 + 5);
  }

  context.strokeStyle = '#b8b8b8';
  context.lineWidth = 2;
  context.strokeRect(chartX, chartY, chartW, chartH);

  context.font = '14px Cascadia Mono, monospace';
  context.fillStyle = '#cfcfcf';
  context.fillText(messages.diagnosticPattern.horizontalModulation, chartX + 38, chartY + chartH + 32);
  context.fillText(messages.diagnosticPattern.gsdfOutputSweep, chartX + 520, chartY + chartH + 32);
  context.fillText(messages.diagnosticPattern.fixedContrastSweep, chartX + 770, chartY + chartH + 32);
  context.fillText(messages.diagnosticPattern.verticalModulation, chartX + chartW - 458, chartY + chartH + 32);
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
  const [patternZoom, setPatternZoom] = React.useState(1);

  return (
    <div className={`gsdf-inspection-mode gsdf-inspection-mode--${mode} flex h-full min-h-0 flex-col overflow-hidden`}>
      <InspectionModeHeader
        title={mode === 'pattern' ? messages.panel.patternTitle : messages.panel.chartTitle}
        subtitle={mode === 'pattern' ? messages.panel.patternSubtitle : messages.panel.chartSubtitle}
        settings={settings}
        setSettings={setSettings}
        onClose={onClose}
        dragHandlers={dragHandlers}
        messages={messages}
      />
      {mode === 'pattern' ? (
        <div
          className="min-h-0 flex-1 overflow-hidden bg-black p-2"
          onWheel={(event) => {
            event.preventDefault();
            const scaleFactor = event.deltaY < 0 ? 1.08 : 0.92;
            setPatternZoom((value) => clampValue(Number((value * scaleFactor).toFixed(3)), 0.5, 3));
          }}
        >
          <FullDiagnosticPattern settings={settings} messages={messages} zoom={patternZoom} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-[#10151b] p-4">
          <div className="h-full rounded-md border border-white/10 bg-[#080b0f] p-3">
            <React.Suspense fallback={<div className="h-full min-h-[240px]" />}>
              <GSDFChart settings={settings} panelTheme={panelTheme} messages={messages} className="h-full min-h-[240px]" />
            </React.Suspense>
          </div>
        </div>
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
      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-white/10 p-3" data-no-drag>
        {([
          { value: 'pattern', label: messages.panel.referencePanel, icon: <Grid3X3 size={13} /> },
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
          title={mode === 'pattern' ? messages.panel.openFullPattern : messages.panel.openFullChart}
          onClick={() => onOpenFull(mode)}
          className="gsdf-text-button flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-[#0b0d10] px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
        >
          <Maximize2 size={13} />
          {mode === 'pattern' ? messages.panel.openFullPattern : messages.panel.openFullChart}
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
  const [standaloneInspectionSize, setStandaloneInspectionSize] = React.useState({
    width: INSPECTION_DEFAULT_WIDTH,
    height: INSPECTION_DEFAULT_HEIGHT,
  });
  const [standalonePanelSize, setStandalonePanelSize] = React.useState(() => getDefaultPanelSize());
  const [panelTheme, setPanelTheme] = React.useState<PanelTheme>(() => {
    const savedTheme = localStorage.getItem(PANEL_THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  useExpandedOverlayViewport(inspectionMode !== null || sidePanelOpen);

  React.useEffect(() => {
    localStorage.setItem(PANEL_THEME_STORAGE_KEY, panelTheme);
  }, [panelTheme]);

  const toggleEnabled = () => {
    setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  const applyOptimizedPreset = () => {
    setSettings((prev) => ({
      ...prev,
      ...getRecommendedImageDefaults(100),
      enabled: true,
      lmax: 100,
      gammaTarget: 1,
      strength: 90,
      sharpness: DEFAULT_APP_SETTINGS.sharpness,
      temperature: DEFAULT_APP_SETTINGS.temperature,
      hue: DEFAULT_APP_SETTINGS.hue,
    }));
  };

  const handleLmaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextLmax = sliderValueToLuminance(e.target.value);

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

  const setDisplayGamut = (value: AppSettings['displayGamut']) => {
    setSettings((prev) => ({ ...prev, displayGamut: value }));
  };

  const setNumericSetting = (
    key: keyof Pick<AppSettings, 'gammaTarget' | 'strength' | 'blackPoint' | 'whitePoint' | 'sharpness' | 'temperature' | 'saturation' | 'hue'>,
    value: number,
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'blackPoint' && next.whitePoint <= value + 10) {
        next.whitePoint = Math.min(100, value + 10);
      }
      if (key === 'whitePoint' && value <= next.blackPoint + 10) {
        next.blackPoint = Math.max(0, value - 10);
      }
      return next;
    });
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
        <StatusDeck settings={settings} onLmaxChange={handleLmaxChange} onResetDefault={resetToDefault} messages={messages} />
      </div>

      <SliderControl
        icon={<Activity size={14} />}
        label={messages.panel.gammaLabel}
        title={messages.panel.gammaTitle}
        valueText={`${gammaCorrection > 0 ? '+' : ''}${gammaCorrection} · γ ${settings.gammaTarget.toFixed(1)}`}
        valueVariant="label"
        minLabel="-100"
        maxLabel="+100"
        min={GAMMA_CORRECTION_MIN}
        max={GAMMA_CORRECTION_MAX}
        value={gammaCorrection}
        onChange={setGammaCorrection}
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
        onChange={(value) => setNumericSetting('strength', value)}
      />
    </div>
  );

  const renderAdvancedPanel = () => (
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
        onChange={(value) => setDisplayGamut(value)}
      />

      <div className={`grid grid-cols-2 gap-3 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
        <SliderControl
          icon={<SlidersHorizontal size={14} />}
          label={messages.panel.blackPoint}
          valueText={`${settings.blackPoint}%`}
          min={0}
          max={20}
          value={settings.blackPoint}
          onChange={(value) => setNumericSetting('blackPoint', value)}
        />
        <SliderControl
          icon={<Sun size={14} />}
          label={messages.panel.whitePoint}
          valueText={`${settings.whitePoint}%`}
          min={80}
          max={100}
          value={settings.whitePoint}
          onChange={(value) => setNumericSetting('whitePoint', value)}
        />
      </div>

      <SliderControl
        disabled={!settings.enabled}
        icon={<SlidersHorizontal size={14} />}
        label={messages.panel.detailSharpening}
        valueText={`${settings.sharpness}%`}
        minLabel="0"
        maxLabel="50"
        min={0}
        max={50}
        step={5}
        value={settings.sharpness}
        onChange={(value) => setNumericSetting('sharpness', value)}
      />

      <SliderControl
        disabled={!settings.enabled}
        icon={<Thermometer size={14} />}
        label={messages.panel.temperatureShift}
        valueText={settings.temperature === 0 ? '0' : settings.temperature > 0 ? `+${settings.temperature}` : String(settings.temperature)}
        minLabel="-50"
        maxLabel="+50"
        min={-50}
        max={50}
        step={1}
        value={settings.temperature}
        onChange={(value) => setNumericSetting('temperature', value)}
      />

      <SliderControl
        disabled={!settings.enabled}
        icon={<Palette size={14} />}
        label={messages.panel.saturation}
        valueText={`${settings.saturation}%`}
        minLabel="0"
        maxLabel="125"
        min={0}
        max={125}
        step={5}
        value={settings.saturation}
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
        onChange={(value) => setNumericSetting('hue', value)}
      />
    </div>
  );

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
                  <div className="truncate text-[12px] font-semibold uppercase tracking-[0.16em] text-white">GSDF EOTF Adjuster</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">{messages.panel.subtitle}</div>
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
            <div className="gsdf-header-controls flex shrink-0 flex-wrap items-center justify-between gap-2" data-no-drag>
              <button
                type="button"
                onClick={toggleEnabled}
                aria-pressed={settings.enabled}
                aria-label={messages.panel.enableEotf}
                title={messages.panel.enableEotf}
                className="gsdf-power-cluster flex min-w-0 items-center gap-2.5 rounded-md border border-white/10 bg-[#080b0f] p-1 pr-3 text-left transition-colors hover:bg-white/[0.04]"
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
                <span className="flex min-w-0 flex-col">
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
                className="gsdf-quick-action rounded-md border border-white/10 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition-colors hover:text-zinc-50"
              >
                {messages.panel.optimizePreset}
              </button>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
