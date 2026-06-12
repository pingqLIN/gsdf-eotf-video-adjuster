import React from 'react';
import { motion, useDragControls } from 'motion/react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleOff,
  Eye,
  Gauge,
  Grid3X3,
  Maximize2,
  MonitorUp,
  Moon,
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
  buildGsdfCalibrationStripeRows,
  buildGsdfStripeRows,
  DEFAULT_GAMMA_TARGET,
  DEFAULT_TARGET_LUMINANCE_NITS,
  DEFAULT_APP_SETTINGS,
  formatLuminance,
  gammaCorrectionToTarget,
  GAMMA_CORRECTION_MAX,
  GAMMA_CORRECTION_MIN,
  gammaTargetToCorrection,
  LUMINANCE_MAX_NITS,
  LUMINANCE_MIN_NITS,
  LUMINANCE_SLIDER_MAX,
  luminanceToSliderValue,
  sliderValueToLuminance,
} from '../types';

const GSDFChart = React.lazy(() => import('./GSDFChart').then((module) => ({ default: module.GSDFChart })));

type PanelTab = 'basic' | 'advanced';
type PanelTheme = 'dark' | 'light';
type InspectionMode = 'pattern' | 'chart' | null;
type PanelLayoutMode = 'a' | 'b' | 'c';
type CenterWorkspaceMode = 'pattern' | 'chart' | 'both';
type ResizeHandle = 'e' | 's' | 'se';

const PANEL_THEME_STORAGE_KEY = 'gsdf_panel_theme';
const INSPECTION_MIN_WIDTH = 560;
const INSPECTION_MIN_HEIGHT = 420;
const INSPECTION_DEFAULT_WIDTH = 960;
const INSPECTION_DEFAULT_HEIGHT = 720;
const PANEL_DEFAULT_HEIGHT = 690;
const PANEL_EXPANDED_DEFAULT_HEIGHT = 720;
const PANEL_MIN_HEIGHT = 520;
const PANEL_VIEWPORT_MARGIN = 16;
const C_PANEL_DEFAULT_CONTROL_WIDTH = 300;
const C_PANEL_MIN_CONTROL_WIDTH = 260;
const C_PANEL_MAX_CONTROL_WIDTH = 420;
const PANEL_MODE_SIZE: Record<PanelLayoutMode, { width: number; minWidth: number }> = {
  a: { width: 420, minWidth: 380 },
  b: { width: 820, minWidth: 680 },
  c: { width: 1240, minWidth: 960 },
};
const PANEL_MODE_OPTIONS: Array<{ value: PanelLayoutMode; label: string; title: string }> = [
  { value: 'a', label: 'A', title: 'A 模式：目前預設的單面板狀態' },
  { value: 'b', label: 'B', title: 'B 模式：基礎 a 在左、進階 b 在右' },
  { value: 'c', label: 'C', title: 'C 模式：a + 中央 c/d/c+d + b 完整展開' },
];
let expandedOverlayCount = 0;

interface DraggablePanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
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

interface ColumnResizeStart {
  pointerId: number;
  x: number;
  width: number;
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
    <span title={title} className={`inline-flex h-7 min-w-0 items-center justify-center gap-1 rounded-md border px-2 text-[10px] font-semibold ${toneClass}`}>
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
    <div className={`space-y-2.5 transition-opacity ${disabled ? 'opacity-45 pointer-events-none' : 'opacity-100'}`}>
      <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
          {icon ?? <SlidersHorizontal size={14} />}
        </span>
        {label}
      </label>
      <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-[#080b0f] p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            disabled={disabled}
            aria-disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded text-[12px] font-semibold transition-colors ${
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
  minLabel,
  maxLabel,
  min,
  max,
  step = 1,
  value,
  disabled = false,
  onChange,
}: SliderControlProps) {
  return (
    <div className={`space-y-2.5 transition-opacity ${disabled ? 'opacity-45 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex items-center justify-between gap-3">
        <label title={title} className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </label>
        <div className="shrink-0 font-mono text-[16px] font-semibold tabular-nums text-zinc-100">
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

function getDefaultPanelSize(mode: PanelLayoutMode) {
  return {
    width: PANEL_MODE_SIZE[mode].width,
    height: mode === 'a' ? PANEL_DEFAULT_HEIGHT : PANEL_EXPANDED_DEFAULT_HEIGHT,
  };
}

function clampStandalonePanelSize(mode: PanelLayoutMode, size: { width: number; height: number }) {
  const maxWidth = typeof window === 'undefined'
    ? PANEL_MODE_SIZE[mode].width
    : Math.max(PANEL_MODE_SIZE[mode].minWidth, window.innerWidth - PANEL_VIEWPORT_MARGIN);
  const defaultHeight = mode === 'a' ? PANEL_DEFAULT_HEIGHT : PANEL_EXPANDED_DEFAULT_HEIGHT;
  const maxHeight = typeof window === 'undefined'
    ? defaultHeight
    : Math.max(PANEL_MIN_HEIGHT, window.innerHeight - PANEL_VIEWPORT_MARGIN);

  return {
    width: clampValue(size.width, PANEL_MODE_SIZE[mode].minWidth, maxWidth),
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

function postPanelLayoutMode(mode: PanelLayoutMode) {
  if (!window.parent || window.parent === window) {
    return;
  }

  window.parent.postMessage({
    type: 'GSDF_PANEL_MODE_CHANGED',
    payload: { mode },
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
  label = '效果應用',
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
}: {
  value: PanelTab;
  onChange: (value: PanelTab) => void;
  panelTheme: PanelTheme;
}) {
  return (
    <div
      role="tablist"
      aria-label="面板模式"
      className="gsdf-tab-switch relative grid h-8 w-28 shrink-0 grid-cols-2 rounded-md border border-white/10 bg-[#080b0f] p-1"
      data-no-drag
    >
      <span
        className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded bg-zinc-100 shadow transition-transform ${value === 'advanced' ? 'translate-x-[calc(100%+4px)]' : 'translate-x-0'}`}
      />
      {(['basic', 'advanced'] as PanelTab[]).map((tab) => {
        const selected = value === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab === 'basic' ? '切換到基礎控制' : '切換到進階控制'}
            onClick={() => onChange(tab)}
            style={selected ? { color: panelTheme === 'light' ? '#f8fafc' : '#111418' } : undefined}
            className={`relative z-10 rounded text-[11px] font-semibold transition-colors ${
              selected ? '' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {tab === 'basic' ? '基礎' : '進階'}
          </button>
        );
      })}
    </div>
  );
}

function PanelLayoutModeSwitch({
  value,
  onChange,
}: {
  value: PanelLayoutMode;
  onChange: (value: PanelLayoutMode) => void;
}) {
  return (
    <div className="grid h-8 w-[96px] shrink-0 grid-cols-3 rounded-md border border-white/10 bg-[#080b0f] p-0.5" data-no-drag>
      {PANEL_MODE_OPTIONS.map((mode) => (
        <button
          key={mode.value}
          type="button"
          title={mode.title}
          aria-label={mode.title}
          aria-pressed={value === mode.value}
          onClick={() => onChange(mode.value)}
          className={`rounded text-[10px] font-semibold transition-colors ${
            value === mode.value
              ? 'bg-zinc-100 text-[#111418] shadow-[0_8px_22px_rgba(0,0,0,0.3)]'
              : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100'
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}

function StatusDeck({
  settings,
  onLmaxChange,
  onResetDefault,
}: {
  settings: AppSettings;
  onLmaxChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onResetDefault: () => void;
}) {
  const statusLabel = settings.enabled ? 'ACTIVE' : 'STANDBY';

  return (
    <section className="gsdf-status-deck space-y-3 rounded-md border border-white/10 bg-[#0a0e13] p-3 shadow-inner">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-zinc-400">
            {settings.enabled ? <CheckCircle2 size={14} className="text-zinc-200" /> : <CircleOff size={14} className="text-zinc-500" />}
            <span>{statusLabel}</span>
          </div>
          <div className="gsdf-status-inline-metrics flex min-w-0 flex-wrap items-center justify-start gap-1.5">
            <ModePill
              tone={settings.enabled ? 'active' : 'neutral'}
              title="完整 GSDF transfer table 先依目標亮度計算，再由 filter 總量混合回 gamma-adjusted baseline。"
            >
              <MonitorUp size={13} />
              GSDF
            </ModePill>
            <ModePill title="Gamma 補償會先於 GSDF table 套用；0 為 γ2.2，左側到 γ3.0，右側到 γ1.0。">
              <Activity size={13} />
              <span className="gsdf-pill-label">γ</span>
              <span className="gsdf-pill-metric">{settings.gammaTarget.toFixed(1)}</span>
            </ModePill>
            <ModePill title="Filter 總量控制完整 GSDF 結果的混入比例；0% 為 gamma-adjusted baseline，100% 為完整 GSDF table。">
              <Gauge size={13} />
              <span className="gsdf-pill-label">mix</span>
              <span className="gsdf-pill-metric">{settings.strength}%</span>
            </ModePill>
            <ModePill>
              <BarChart3 size={13} />
              {settings.colorModel === 'ycbcr' ? 'YCbCr' : 'RGB'}
            </ModePill>
          </div>
        </div>
        <button
          onClick={onResetDefault}
          className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          title={`重設為 ${DEFAULT_TARGET_LUMINANCE_NITS} nits、Gamma ${DEFAULT_GAMMA_TARGET.toFixed(1)}、90% filter 總量與預設影像參數。`}
          data-no-drag
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div
        title="完整 GSDF table 會依此目標峰值亮度建立，不再把任何亮度當作中性不補償點。"
        className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
      >
        <span className="font-mono text-[24px] leading-none text-zinc-50 tabular-nums">{formatLuminance(settings.lmax)}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">nits</span>
        <span className="text-[11px] font-semibold text-zinc-300">目標螢幕亮度 (Lmax)</span>
        <span className="text-[9px] font-semibold text-zinc-500">目標值非實際測</span>
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
  zoom = 1,
}: {
  settings: AppSettings;
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
      drawDiagnosticPattern(context, settings);
      context.restore();
    };

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();

    return () => observer.disconnect();
  }, [settings, zoom]);

  return <canvas ref={canvasRef} className="h-full w-full bg-black" aria-label="GSDF QC diagnostic pattern" />;
}

function drawDiagnosticPattern(context: CanvasRenderingContext2D, settings: AppSettings) {
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
  context.fillText('GSDF-QC FULL FIELD PATTERN', 58, 76);
  context.font = '15px Cascadia Mono, monospace';
  context.fillStyle = '#9a9a9a';
  context.fillText('18 grayscale steps · directional modulation · line-pair resolution · vertical gradient uniformity', 58, 104);

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
  context.fillText('H modulation: 18 / 12 / 6 / 4 px', chartX + 38, chartY + chartH + 32);
  context.fillText('GSDF output sweep', chartX + 520, chartY + chartH + 32);
  context.fillText('fixed contrast sweep', chartX + 770, chartY + chartH + 32);
  context.fillText('V modulation: 4 / 6 / 12 / 18 px', chartX + chartW - 458, chartY + chartH + 32);
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
}: {
  title: string;
  subtitle: string;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onClose: () => void;
  dragHandlers: PointerHandlers;
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
            title="關閉"
            aria-label="關閉"
            onClick={onClose}
            className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="min-w-[58px] text-right font-mono text-[18px] font-semibold leading-none tabular-nums text-zinc-100">
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
}: {
  mode: Exclude<InspectionMode, null>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onClose: () => void;
  panelTheme: PanelTheme;
  dragHandlers: PointerHandlers;
  resizeHandlers: PointerHandlers;
}) {
  const [patternZoom, setPatternZoom] = React.useState(1);

  return (
    <div className={`gsdf-inspection-mode gsdf-inspection-mode--${mode} flex h-full min-h-0 flex-col overflow-hidden`}>
      <InspectionModeHeader
        title={mode === 'pattern' ? 'GSDF-QC 全域測試圖' : '即時對比度分析視圖'}
        subtitle={mode === 'pattern' ? 'full-field grayscale, modulation, line-pair and gradient pattern' : 'input pixel value vs normalized table output'}
        settings={settings}
        setSettings={setSettings}
        onClose={onClose}
        dragHandlers={dragHandlers}
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
          <FullDiagnosticPattern settings={settings} zoom={patternZoom} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-[#10151b] p-4">
          <div className="h-full rounded-md border border-white/10 bg-[#080b0f] p-3">
            <React.Suspense fallback={<div className="h-full min-h-[240px]" />}>
              <GSDFChart settings={settings} panelTheme={panelTheme} className="h-full min-h-[240px]" />
            </React.Suspense>
          </div>
        </div>
      )}
      <div
        className="gsdf-resize-grip absolute right-1.5 bottom-1.5 z-10 h-5 w-5 cursor-nwse-resize rounded-sm border-r border-b border-white/35 opacity-70 transition-opacity hover:opacity-100"
        title="拖曳調整視圖大小"
        aria-label="拖曳調整視圖大小"
        role="separator"
        data-no-drag
        {...resizeHandlers}
      />
    </div>
  );
}

function PanelBorderResizeHandles({
  getResizeHandlers,
}: {
  getResizeHandlers: (handle: ResizeHandle) => PointerHandlers;
}) {
  return (
    <>
      <div
        className="gsdf-resize-edge gsdf-resize-edge--right absolute top-16 right-0 bottom-8 z-20 w-2 cursor-ew-resize"
        title="拖曳右邊框調整面板寬度"
        aria-label="拖曳右邊框調整面板寬度"
        role="separator"
        data-no-drag
        data-resize-handle="e"
        {...getResizeHandlers('e')}
      />
      <div
        className="gsdf-resize-edge gsdf-resize-edge--bottom absolute right-8 bottom-0 left-8 z-20 h-2 cursor-ns-resize"
        title="拖曳底邊框調整面板高度"
        aria-label="拖曳底邊框調整面板高度"
        role="separator"
        data-no-drag
        data-resize-handle="s"
        {...getResizeHandlers('s')}
      />
      <div
        className="gsdf-resize-grip absolute right-1.5 bottom-1.5 z-30 h-5 w-5 cursor-nwse-resize rounded-sm border-r border-b border-white/35 opacity-70 transition-opacity hover:opacity-100"
        title="拖曳右下角調整面板大小"
        aria-label="拖曳右下角調整面板大小"
        role="separator"
        data-no-drag
        data-resize-handle="se"
        {...getResizeHandlers('se')}
      />
    </>
  );
}

function GSDFStripeTest({
  settings,
  onOpenFullPattern,
}: {
  settings: AppSettings;
  onOpenFullPattern: () => void;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const compactStripeWidth = 18;
  const outputRows = React.useMemo(() => buildGsdfStripeRows(settings), [settings]);
  const calibrationRows = React.useMemo(() => buildGsdfCalibrationStripeRows(), []);

  const renderRows = (rows: ReturnType<typeof buildGsdfStripeRows>, condensed = false) => (
    <div className={`space-y-1.5 overflow-hidden rounded-md border border-white/10 bg-[#080b0f] ${condensed ? 'p-2' : 'p-3'}`}>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[44px_1fr] items-center gap-2.5">
          <span className="font-mono text-[9px] font-semibold tracking-[0.12em] text-zinc-500">{row.label}</span>
          <div
            className={`${condensed ? 'h-6' : 'h-10'} rounded border border-white/[0.06] shadow-inner`}
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, rgb(${row.left} ${row.left} ${row.left}) 0 ${compactStripeWidth}px, rgb(${row.right} ${row.right} ${row.right}) ${compactStripeWidth}px ${compactStripeWidth * 2}px)`,
            }}
          />
        </div>
      ))}
    </div>
  );

  return (
    <section className={`space-y-3 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-70'}`}>
      <div className="flex items-center justify-between gap-3">
        <label
          title="輸出預覽使用完整 GSDF table 加上目前 filter 總量生成；大圖請開啟完整多頻率條紋圖。"
          className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            <Eye size={14} />
          </span>
          GSDF 條紋測試
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={showDetails ? '收合亮度校準' : '展開亮度校準'}
            onClick={() => setShowDetails((value) => !value)}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            data-no-drag
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            title="開啟完整多頻率條紋圖"
            onClick={onOpenFullPattern}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            data-no-drag
          >
            <Grid3X3 size={14} />
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">輸出預覽</div>
        {renderRows(outputRows, true)}
      </div>
      {showDetails && (
        <div className="space-y-2">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">亮度校準</div>
          {renderRows(calibrationRows)}
        </div>
      )}
    </section>
  );
}

function ContrastChartPanel({
  onOpenFullChart,
}: {
  onOpenFullChart: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            <Activity size={14} />
          </span>
          即時對比度分析視圖
        </label>
        <button
          type="button"
          title="開啟完整曲線圖"
          onClick={onOpenFullChart}
          className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-zinc-100"
          data-no-drag
        >
          <Maximize2 size={13} />
          完整圖表
        </button>
      </div>
    </section>
  );
}

export function DraggablePanel({
  settings,
  setSettings,
  extensionMode = false,
  onExtensionDrag,
  onExtensionResize,
  onExtensionClose,
}: DraggablePanelProps) {
  const dragControls = useDragControls();
  const dragStartRef = React.useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const resizeStartRef = React.useRef<{ pointerId: number; x: number; y: number; handle: ResizeHandle } | null>(null);
  const cColumnResizeRef = React.useRef<ColumnResizeStart | null>(null);
  const [activeTab, setActiveTab] = React.useState<PanelTab>('basic');
  const [panelMode, setPanelMode] = React.useState<PanelLayoutMode>('a');
  const [centerMode, setCenterMode] = React.useState<CenterWorkspaceMode>('pattern');
  const [cControlWidth, setCControlWidth] = React.useState(C_PANEL_DEFAULT_CONTROL_WIDTH);
  const [inspectionMode, setInspectionMode] = React.useState<InspectionMode>(null);
  const [panelClosed, setPanelClosed] = React.useState(false);
  const [standaloneInspectionSize, setStandaloneInspectionSize] = React.useState({
    width: INSPECTION_DEFAULT_WIDTH,
    height: INSPECTION_DEFAULT_HEIGHT,
  });
  const [standalonePanelSize, setStandalonePanelSize] = React.useState(() => getDefaultPanelSize('a'));
  const [panelTheme, setPanelTheme] = React.useState<PanelTheme>(() => {
    const savedTheme = localStorage.getItem(PANEL_THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });
  useExpandedOverlayViewport(inspectionMode !== null);

  React.useEffect(() => {
    localStorage.setItem(PANEL_THEME_STORAGE_KEY, panelTheme);
  }, [panelTheme]);

  React.useEffect(() => {
    postPanelLayoutMode(panelMode);
  }, [panelMode]);

  const selectPanelMode = (value: PanelLayoutMode) => {
    setPanelMode(value);
    setInspectionMode(null);
    setStandalonePanelSize(clampStandalonePanelSize(value, getDefaultPanelSize(value)));
  };

  const toggleEnabled = () => {
    setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleLmaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, lmax: sliderValueToLuminance(e.target.value) }));
  };

  const setColorModel = (value: AppSettings['colorModel']) => {
    setSettings((prev) => ({ ...prev, colorModel: value }));
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

  const renderBasicPanel = (showStripePreview = true) => (
    <div className="space-y-3">
      <div className={`transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-75'}`}>
        <StatusDeck settings={settings} onLmaxChange={handleLmaxChange} onResetDefault={resetToDefault} />
      </div>

      <SliderControl
        icon={<Activity size={14} />}
        label="Gamma 補償"
        title="中央 0 為 γ2.2 無調整；往左補償更暗觀影環境到 γ3.0，往右補償到 γ1.0 線性。"
        valueText={`${gammaCorrection > 0 ? '+' : ''}${gammaCorrection} · γ ${settings.gammaTarget.toFixed(1)}`}
        minLabel="-100"
        maxLabel="+100"
        min={GAMMA_CORRECTION_MIN}
        max={GAMMA_CORRECTION_MAX}
        value={gammaCorrection}
        onChange={setGammaCorrection}
      />

      <SliderControl
        icon={<Gauge size={14} />}
        label="Filter 總量"
        title="完整 GSDF table 先算出來，再用此總量混合回 gamma-adjusted baseline；0% 為 gamma-adjusted baseline，100% 為完整 GSDF。"
        valueText={`${settings.strength}%`}
        minLabel="0"
        maxLabel="100"
        min={0}
        max={100}
        step={5}
        value={settings.strength}
        onChange={(value) => setNumericSetting('strength', value)}
      />

      {showStripePreview && (
        <GSDFStripeTest settings={settings} onOpenFullPattern={() => setInspectionMode('pattern')} />
      )}
    </div>
  );

  const renderAdvancedPanel = (showContrastPreview = true) => (
    <div className="space-y-3">
      <SegmentedControl
        disabled={!settings.enabled}
        icon={<BarChart3 size={14} />}
        label="色彩模型"
        value={settings.colorModel}
        options={[
          { value: 'rgb', label: 'RGB', title: '對 R/G/B 三通道套同一張 GSDF table' },
          { value: 'ycbcr', label: 'YCbCr', title: '轉成 YCbCr 後只調整 Y 亮度，保留 Cb/Cr 色度' },
        ]}
        onChange={(value) => setColorModel(value)}
      />

      <div className={`grid grid-cols-2 gap-3 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
        <SliderControl
          icon={<SlidersHorizontal size={14} />}
          label="黑位"
          valueText={`${settings.blackPoint}%`}
          min={0}
          max={20}
          value={settings.blackPoint}
          onChange={(value) => setNumericSetting('blackPoint', value)}
        />
        <SliderControl
          icon={<Sun size={14} />}
          label="白點"
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
        label="細節銳化"
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
        label="色溫偏移"
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
        label="飽和度"
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
        label="色調"
        valueText={settings.hue === 0 ? '0' : settings.hue > 0 ? `+${settings.hue}` : String(settings.hue)}
        minLabel="-30"
        maxLabel="+30"
        min={-30}
        max={30}
        step={5}
        value={settings.hue}
        onChange={(value) => setNumericSetting('hue', value)}
      />

      {showContrastPreview && <ContrastChartPanel onOpenFullChart={() => setInspectionMode('chart')} />}
    </div>
  );

  const renderCenterWorkspace = () => (
    <section className="flex min-h-0 h-full flex-col overflow-hidden rounded-md border border-white/10 bg-[#080b0f]">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3">
        <label className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            <Grid3X3 size={14} />
          </span>
          <span className="truncate">中央視圖</span>
        </label>
        <div className="grid h-7 w-[132px] shrink-0 grid-cols-3 rounded-md border border-white/10 bg-[#090c10] p-0.5" data-no-drag>
          {[
            { value: 'pattern', label: 'C', title: 'GSDF-QC 全域測試圖' },
            { value: 'chart', label: 'D', title: '即時對比度分析視圖' },
            { value: 'both', label: 'C+D', title: '同時顯示 GSDF-QC 與即時對比度分析視圖' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.title}
              aria-pressed={centerMode === option.value}
              onClick={() => setCenterMode(option.value as CenterWorkspaceMode)}
              className={`rounded text-[10px] font-semibold transition-colors ${
                centerMode === option.value
                  ? 'bg-zinc-100 text-[#111418]'
                  : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`min-h-0 flex-1 ${centerMode === 'both' ? 'grid grid-cols-2' : 'block'}`}>
        {(centerMode === 'pattern' || centerMode === 'both') && (
          <div className="h-full min-h-0 overflow-hidden bg-black p-2">
            <FullDiagnosticPattern settings={settings} />
          </div>
        )}
        {(centerMode === 'chart' || centerMode === 'both') && (
          <div className="h-full min-h-0 bg-[#10151b] p-3">
            <div className="h-full rounded-md border border-white/10 bg-[#080b0f] p-3">
              <React.Suspense fallback={<div className="h-full min-h-[180px]" />}>
                <GSDFChart settings={settings} panelTheme={panelTheme} className="h-full min-h-[180px]" />
              </React.Suspense>
            </div>
          </div>
        )}
      </div>
    </section>
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

      setStandalonePanelSize((current) => clampStandalonePanelSize(panelMode, {
        width: current.width + deltaWidth,
        height: current.height + deltaHeight,
      }));
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

  const handleCColumnResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    cColumnResizeRef.current = { pointerId: e.pointerId, x: e.clientX, width: cControlWidth };
    trySetPointerCapture(e.currentTarget, e.pointerId);
  };

  const handleCColumnResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cColumnResizeRef.current || cColumnResizeRef.current.pointerId !== e.pointerId) {
      return;
    }

    e.preventDefault();
    const deltaX = e.clientX - cColumnResizeRef.current.x;
    setCControlWidth(clampValue(
      cColumnResizeRef.current.width + deltaX,
      C_PANEL_MIN_CONTROL_WIDTH,
      C_PANEL_MAX_CONTROL_WIDTH,
    ));
  };

  const handleCColumnResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cColumnResizeRef.current?.pointerId === e.pointerId) {
      tryReleasePointerCapture(e.currentTarget, e.pointerId);
    }
    cColumnResizeRef.current = null;
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
        />
      ) : (
        <>
      <div
        className={`gsdf-panel-header cursor-grab select-none border-b border-white/10 bg-[#181c21] px-4 py-3 active:cursor-grabbing ${panelMode === 'c' ? '' : 'space-y-3'}`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-zinc-200">
              <Settings size={16} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-white">GSDF EOTF Adjuster</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">perceptual video filter</div>
            </div>
          </div>
          <div className={`ml-auto flex shrink-0 items-center gap-2 ${panelMode === 'c' ? 'gsdf-header-controls' : ''}`} data-no-drag>
            <PanelLayoutModeSwitch value={panelMode} onChange={selectPanelMode} />
            {panelMode === 'c' && (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  <EffectSwitch enabled={settings.enabled} onToggle={toggleEnabled} label="啟動 EOTF 修正" />
                  <span className="truncate text-[11px] font-semibold text-zinc-300">{settings.enabled ? '效果開啟' : '效果關閉'}</span>
                </div>
                <button
                  type="button"
                  title={panelTheme === 'light' ? '切換到暗色面板' : '切換到明亮面板'}
                  aria-label={panelTheme === 'light' ? '切換到暗色面板' : '切換到明亮面板'}
                  onClick={() => setPanelTheme((theme) => (theme === 'light' ? 'dark' : 'light'))}
                  className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                  data-no-drag
                >
                  {panelTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                </button>
              </>
            )}
            <button
              type="button"
              title="關閉面板"
              aria-label="關閉面板"
              onClick={handlePanelClose}
              className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        {panelMode !== 'c' && <div className="gsdf-header-controls flex shrink-0 flex-wrap items-center justify-end gap-2" data-no-drag>
          <div className="flex min-w-0 items-center gap-2.5">
            <EffectSwitch enabled={settings.enabled} onToggle={toggleEnabled} label="啟動 EOTF 修正" />
            <span className="truncate text-[11px] font-semibold text-zinc-300">{settings.enabled ? '效果開啟' : '效果關閉'}</span>
          </div>
          {panelMode === 'a' && <PanelTabSwitch value={activeTab} onChange={setActiveTab} panelTheme={panelTheme} />}
          <button
            type="button"
            title={panelTheme === 'light' ? '切換到暗色面板' : '切換到明亮面板'}
            aria-label={panelTheme === 'light' ? '切換到暗色面板' : '切換到明亮面板'}
            onClick={() => setPanelTheme((theme) => (theme === 'light' ? 'dark' : 'light'))}
            className="gsdf-icon-button flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            data-no-drag
          >
            {panelTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`min-h-0 space-y-3 overflow-y-auto overflow-x-hidden p-4 ${panelMode === 'a' ? '' : 'flex-1'}`}>
          {panelMode === 'a' && (
            <>
              <div hidden={activeTab !== 'basic'} aria-hidden={activeTab !== 'basic'}>
                {renderBasicPanel(true)}
              </div>
              <div hidden={activeTab !== 'advanced'} aria-hidden={activeTab !== 'advanced'}>
                {renderAdvancedPanel(true)}
              </div>
            </>
          )}

          {panelMode === 'b' && (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-hidden">
                <div className="min-h-0 overflow-hidden">{renderBasicPanel()}</div>
                <div className="min-h-0 overflow-hidden">{renderAdvancedPanel(false)}</div>
              </div>
          )}

          {panelMode === 'c' && (
            <div
              className="grid h-full min-h-0 overflow-hidden"
              style={{ gridTemplateColumns: `${cControlWidth}px 12px minmax(0,1fr)` }}
            >
              <div className="min-h-0 space-y-4 overflow-y-auto overflow-x-hidden pr-3">
                {renderBasicPanel(false)}
                {renderAdvancedPanel(false)}
              </div>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="調整左側面板寬度"
                title="左右拖曳調整左側面板寬度"
                className="gsdf-column-resize-handle flex min-h-0 cursor-col-resize items-stretch justify-center"
                data-no-drag
                onPointerDown={handleCColumnResizePointerDown}
                onPointerMove={handleCColumnResizePointerMove}
                onPointerUp={handleCColumnResizePointerUp}
                onPointerCancel={handleCColumnResizePointerUp}
              >
                <span className="my-1 w-px rounded-full bg-white/10" />
              </div>
              <div className="min-h-0 overflow-hidden">{renderCenterWorkspace()}</div>
            </div>
          )}
        </div>
      </div>
      <PanelBorderResizeHandles getResizeHandlers={getResizeHandlers} />
        </>
      )}

    </motion.div>
  );
}
