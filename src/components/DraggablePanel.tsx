import React from 'react';
import { createPortal } from 'react-dom';
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

const PANEL_THEME_STORAGE_KEY = 'gsdf_panel_theme';
const FLOATING_WINDOW_MARGIN = 12;
let expandedOverlayCount = 0;

interface DraggablePanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  extensionMode?: boolean;
  onExtensionDrag?: (deltaX: number, deltaY: number) => void;
  onExtensionClose?: () => void;
}

interface FloatingWindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloatingOverlayWindowProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  headerExtras?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
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
      ? 'border-cyan-400/45 bg-cyan-400/12 text-cyan-100'
      : tone === 'amber'
        ? 'border-amber-300/35 bg-amber-300/10 text-amber-100'
        : 'border-white/10 bg-white/[0.04] text-zinc-300';

  return (
    <span title={title} className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold ${toneClass}`}>
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
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-cyan-300">
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
                ? 'bg-cyan-400 text-[#061116] shadow-[0_0_18px_rgba(34,211,238,0.16)]'
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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-cyan-300">
            {icon}
          </span>
          <span className="truncate">{label}</span>
        </label>
        <div className="shrink-0 font-mono text-[16px] font-semibold tabular-nums text-cyan-200">
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

function getViewportSize() {
  return {
    width: Math.max(320, Number(window.innerWidth || 1280)),
    height: Math.max(320, Number(window.innerHeight || 720)),
  };
}

function clampFloatingLayout(layout: FloatingWindowLayout, minWidth: number, minHeight: number): FloatingWindowLayout {
  const viewport = getViewportSize();
  const maxWidth = Math.max(minWidth, viewport.width - FLOATING_WINDOW_MARGIN * 2);
  const maxHeight = Math.max(minHeight, viewport.height - FLOATING_WINDOW_MARGIN * 2);
  const width = clampValue(layout.width, minWidth, maxWidth);
  const height = clampValue(layout.height, minHeight, maxHeight);
  const maxX = Math.max(FLOATING_WINDOW_MARGIN, viewport.width - width - FLOATING_WINDOW_MARGIN);
  const maxY = Math.max(FLOATING_WINDOW_MARGIN, viewport.height - height - FLOATING_WINDOW_MARGIN);

  return {
    x: clampValue(layout.x, FLOATING_WINDOW_MARGIN, maxX),
    y: clampValue(layout.y, FLOATING_WINDOW_MARGIN, maxY),
    width,
    height,
  };
}

function getInitialFloatingLayout(defaultWidth: number, defaultHeight: number, minWidth: number, minHeight: number): FloatingWindowLayout {
  const viewport = getViewportSize();
  const width = Math.min(defaultWidth, viewport.width - FLOATING_WINDOW_MARGIN * 2);
  const height = Math.min(defaultHeight, viewport.height - FLOATING_WINDOW_MARGIN * 2);

  return clampFloatingLayout({
    x: Math.round((viewport.width - width) / 2),
    y: Math.round((viewport.height - height) / 2),
    width,
    height,
  }, minWidth, minHeight);
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

function FloatingOverlayWindow({
  title,
  subtitle,
  onClose,
  defaultWidth,
  defaultHeight,
  minWidth,
  minHeight,
  headerExtras,
  bodyClassName = 'min-h-0 flex-1 overflow-hidden bg-[#080b0f]',
  children,
}: FloatingOverlayWindowProps) {
  const [layout, setLayout] = React.useState(() => getInitialFloatingLayout(defaultWidth, defaultHeight, minWidth, minHeight));
  const dragStateRef = React.useRef<{ pointerId: number; startX: number; startY: number; layout: FloatingWindowLayout } | null>(null);
  const resizeStateRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    layout: FloatingWindowLayout;
    corner: 'nw' | 'ne' | 'sw' | 'se';
  } | null>(null);

  React.useEffect(() => {
    const handleViewportResize = () => {
      setLayout((current) => clampFloatingLayout(current, minWidth, minHeight));
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [minHeight, minWidth]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveDragTarget(e.target)) {
      return;
    }

    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      layout,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) {
      return;
    }

    const nextLayout = {
      ...dragState.layout,
      x: dragState.layout.x + (e.clientX - dragState.startX),
      y: dragState.layout.y + (e.clientY - dragState.startY),
    };
    setLayout(clampFloatingLayout(nextLayout, minWidth, minHeight));
  };

  const stopDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      dragStateRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const startResize = (corner: 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent<HTMLDivElement>) => {
    resizeStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      layout,
      corner,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== e.pointerId) {
      return;
    }

    const deltaX = e.clientX - resizeState.startX;
    const deltaY = e.clientY - resizeState.startY;
    const nextLayout = { ...resizeState.layout };

    if (resizeState.corner === 'ne' || resizeState.corner === 'se') {
      nextLayout.width = resizeState.layout.width + deltaX;
    } else {
      nextLayout.width = resizeState.layout.width - deltaX;
      nextLayout.x = resizeState.layout.x + deltaX;
    }

    if (resizeState.corner === 'sw' || resizeState.corner === 'se') {
      nextLayout.height = resizeState.layout.height + deltaY;
    } else {
      nextLayout.height = resizeState.layout.height - deltaY;
      nextLayout.y = resizeState.layout.y + deltaY;
    }

    setLayout(clampFloatingLayout(nextLayout, minWidth, minHeight));
  };

  const stopResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (resizeStateRef.current?.pointerId === e.pointerId) {
      resizeStateRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] pointer-events-none select-none">
      <div
        className="pointer-events-auto absolute flex flex-col overflow-hidden rounded-md border border-white/10 bg-[#0b0e12] shadow-2xl"
        style={{
          left: `${layout.x}px`,
          top: `${layout.y}px`,
          width: `${layout.width}px`,
          height: `${layout.height}px`,
        }}
        data-no-drag
      >
        <div
          className="flex cursor-move items-center justify-between gap-3 border-b border-white/10 bg-[#111820] px-4 py-3"
          onPointerDown={startDrag}
          onPointerMove={handleDragMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-zinc-100">{title}</div>
            <div className="font-mono text-[9px] text-zinc-500">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {headerExtras}
            <button
              type="button"
              title="關閉"
              onClick={onClose}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div className={bodyClassName}>{children}</div>
        <div
          className="absolute left-0 top-0 h-4 w-4 cursor-nwse-resize"
          onPointerDown={startResize('nw')}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          data-no-drag
        />
        <div
          className="absolute right-0 top-0 h-4 w-4 cursor-nesw-resize"
          onPointerDown={startResize('ne')}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          data-no-drag
        />
        <div
          className="absolute bottom-0 left-0 h-4 w-4 cursor-nesw-resize"
          onPointerDown={startResize('sw')}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          data-no-drag
        />
        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          onPointerDown={startResize('se')}
          onPointerMove={handleResizeMove}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          data-no-drag
        />
      </div>
    </div>,
    document.body,
  );
}

function StatusDeck({ settings }: { settings: AppSettings }) {
  const statusLabel = settings.enabled ? 'ACTIVE' : 'STANDBY';

  return (
    <section className="rounded-md border border-white/10 bg-[#0a0e13] p-3 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
            {settings.enabled ? <CheckCircle2 size={14} className="text-emerald-300" /> : <CircleOff size={14} className="text-zinc-500" />}
            <span>{statusLabel}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[30px] leading-none text-zinc-50 tabular-nums">{formatLuminance(settings.lmax)}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">nits</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <ModePill
            tone={settings.enabled ? 'active' : 'neutral'}
            title="完整 GSDF transfer table 先依目標亮度計算，再由 filter 總量混合回 gamma-adjusted baseline。"
          >
            <MonitorUp size={13} />
            GSDF
          </ModePill>
          <ModePill title="Gamma 補償會先於 GSDF table 套用；0 為 γ2.2，左側到 γ3.0，右側到 γ1.0。">
            <Activity size={13} />
            γ{settings.gammaTarget.toFixed(1)}
          </ModePill>
          <ModePill title="Filter 總量控制完整 GSDF 結果的混入比例；0% 為 gamma-adjusted baseline，100% 為完整 GSDF table。">
            <Gauge size={13} />
            {settings.strength}%
          </ModePill>
          <ModePill tone={settings.colorModel === 'ycbcr' ? 'amber' : 'neutral'}>
            <BarChart3 size={13} />
            {settings.colorModel.toUpperCase()}
          </ModePill>
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

function PatternLuminanceControl({
  settings,
  setSettings,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-[#0b1016] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-zinc-200">GSDF 亮度調整</div>
          <div className="font-mono text-[9px] text-zinc-500">大圖顯示時仍可直接調整目標亮度</div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] font-semibold leading-none tabular-nums text-cyan-200">
            {formatLuminance(settings.lmax)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">nits</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
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
      </div>
    </div>
  );
}

function GSDFStripeTest({
  settings,
  setSettings,
}: {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [showFullPattern, setShowFullPattern] = React.useState(false);
  const [patternZoom, setPatternZoom] = React.useState(1);
  const compactStripeWidth = 18;
  const outputRows = React.useMemo(() => buildGsdfStripeRows(settings), [settings]);
  const calibrationRows = React.useMemo(() => buildGsdfCalibrationStripeRows(), []);
  useExpandedOverlayViewport(showFullPattern);

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
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-cyan-300">
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
            onClick={() => setShowFullPattern(true)}
            className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-cyan-300"
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
      {showFullPattern && (
        <FloatingOverlayWindow
          title="GSDF-QC 全域測試圖"
          subtitle="full-field grayscale, modulation, line-pair and gradient pattern"
          onClose={() => setShowFullPattern(false)}
          defaultWidth={1180}
          defaultHeight={760}
          minWidth={560}
          minHeight={420}
          headerExtras={(
            <button
              type="button"
              title="重設縮放為 100%"
              onClick={() => setPatternZoom(1)}
              className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-cyan-200 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/10"
            >
              {Math.round(patternZoom * 100)}%
            </button>
          )}
          bodyClassName="min-h-0 flex h-full flex-col overflow-hidden bg-black"
        >
          <PatternLuminanceControl settings={settings} setSettings={setSettings} />
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
        </FloatingOverlayWindow>
      )}
    </section>
  );
}

function ContrastChartPanel({ settings }: { settings: AppSettings }) {
  const [showFullChart, setShowFullChart] = React.useState(false);
  useExpandedOverlayViewport(showFullChart);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-cyan-300">
            <Activity size={14} />
          </span>
          即時對比度分析視圖
        </label>
        <button
          type="button"
          title="開啟完整曲線圖"
          onClick={() => setShowFullChart(true)}
          className="flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-100"
          data-no-drag
        >
          <Maximize2 size={13} />
          完整圖表
        </button>
      </div>
      <div className="rounded-md border border-white/10 bg-[#080b0f] p-3">
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-zinc-400">
          <span>Transfer curve preview</span>
          <span className="text-cyan-200">{settings.enabled ? 'active table' : 'standby reference'}</span>
        </div>
        <div className="mt-2 h-16 rounded border border-white/[0.06] bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(245,158,11,0.10)),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:100%_100%,32px_32px,32px_32px]" />
      </div>
      {showFullChart && (
        <FloatingOverlayWindow
          title="完整 GSDF transfer curve"
          subtitle="input pixel value vs normalized table output"
          onClose={() => setShowFullChart(false)}
          defaultWidth={560}
          defaultHeight={300}
          minWidth={360}
          minHeight={220}
          bodyClassName="min-h-0 flex-1 overflow-hidden bg-[#080b0f] p-3"
        >
          <div className="h-full rounded-md border border-white/10 bg-[#080b0f] p-2">
            <React.Suspense fallback={<div className="h-full min-h-[180px]" />}>
              <GSDFChart settings={settings} className="h-full min-h-[180px]" />
            </React.Suspense>
          </div>
        </FloatingOverlayWindow>
      )}
    </section>
  );
}

export function DraggablePanel({
  settings,
  setSettings,
  extensionMode = false,
  onExtensionDrag,
  onExtensionClose,
}: DraggablePanelProps) {
  const dragControls = useDragControls();
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = React.useState<PanelTab>('basic');
  const [panelTheme, setPanelTheme] = React.useState<PanelTheme>(() => {
    const savedTheme = localStorage.getItem(PANEL_THEME_STORAGE_KEY);
    return savedTheme === 'light' ? 'light' : 'dark';
  });

  React.useEffect(() => {
    localStorage.setItem(PANEL_THEME_STORAGE_KEY, panelTheme);
  }, [panelTheme]);

  const handleEnabledChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, enabled: e.target.checked }));
  };

  const handleLmaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, lmax: sliderValueToLuminance(e.target.value) }));
  };

  const setColorModel = (value: AppSettings['colorModel']) => {
    setSettings((prev) => ({ ...prev, colorModel: value }));
  };

  const setNumericSetting = (key: keyof Pick<AppSettings, 'gammaTarget' | 'strength' | 'blackPoint' | 'whitePoint' | 'sharpness' | 'temperature'>, value: number) => {
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
  const gammaCorrection = gammaTargetToCorrection(settings.gammaTarget);
  const setGammaCorrection = (value: number) => {
    setNumericSetting('gammaTarget', gammaCorrectionToTarget(value));
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isInteractiveDragTarget(e.target)) {
      return;
    }

    if (!extensionMode) {
      dragControls.start(e);
      return;
    }

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!extensionMode || !dragStartRef.current) {
      return;
    }

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    onExtensionDrag?.(deltaX, deltaY);
  };

  const handleHeaderPointerUp = () => {
    dragStartRef.current = null;
  };

  return (
    <motion.div
      drag={!extensionMode}
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={extensionMode ? false : { x: 24, y: 24 }}
      data-panel-theme={panelTheme}
      className={`${extensionMode ? 'relative' : 'absolute'} gsdf-panel theme-${panelTheme} top-0 left-0 z-50 flex h-[720px] max-h-[calc(100vh-16px)] w-[420px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111418] font-sans text-zinc-200 shadow-2xl`}
    >
      <div
        className="flex cursor-grab select-none items-center justify-between border-b border-white/10 bg-[#181c21] px-4 py-3 active:cursor-grabbing"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 bg-cyan-300/10 text-cyan-300">
            <Settings size={16} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-white">GSDF EOTF Adjuster</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">perceptual video filter</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2" data-no-drag>
          {extensionMode && (
            <button
              type="button"
              title="關閉面板"
              aria-label="關閉面板"
              onClick={onExtensionClose}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            title={panelTheme === 'light' ? '切換到暗色面板' : '切換到明亮面板'}
            aria-label={panelTheme === 'light' ? '切換到暗色面板' : '切換到明亮面板'}
            onClick={() => setPanelTheme((theme) => (theme === 'light' ? 'dark' : 'light'))}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0b0d10] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-cyan-300"
          >
            {panelTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <label
            className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-md border border-white/10 bg-[#0b0d10] p-1"
            title="啟動 EOTF 修正"
          >
            <input
              type="checkbox"
              name="enable-gsdf"
              id="enable-gsdf"
              aria-label="啟動 EOTF 修正"
              checked={settings.enabled}
              onChange={handleEnabledChange}
              className="peer sr-only"
            />
            <span className="pointer-events-none absolute inset-1 rounded bg-white/[0.04] transition-colors peer-checked:bg-cyan-400/20" />
            <span className="relative z-10 flex h-6 w-6 translate-x-0 items-center justify-center rounded bg-zinc-500 text-[#0b0d10] transition-transform peer-checked:translate-x-6 peer-checked:bg-cyan-300">
              <Power size={13} />
            </span>
          </label>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-[#090c10] p-1">
            {(['basic', 'advanced'] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-9 rounded text-[12px] font-semibold transition-colors ${
                  activeTab === tab
                    ? 'bg-zinc-100 text-[#111418]'
                    : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
                }`}
              >
                {tab === 'basic' ? '基礎' : '進階'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-hidden p-4">
          <StatusDeck settings={settings} />

          {activeTab === 'basic' && (
            <>
              <section className={`space-y-3 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-75'}`}>
                <div className="flex items-center justify-between gap-3">
                  <label
                    title="完整 GSDF table 會依此目標峰值亮度建立，不再把任何亮度當作中性不補償點。"
                    className="flex items-center gap-2 text-[11px] font-semibold text-zinc-300"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.05] text-cyan-300">
                      <Sun size={14} />
                    </span>
                    目標螢幕亮度 (Lmax)
                  </label>
                  <button
                    onClick={resetToDefault}
                    className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-cyan-300"
                    title={`重設為 ${DEFAULT_TARGET_LUMINANCE_NITS} nits、Gamma ${DEFAULT_GAMMA_TARGET.toFixed(1)}、80% filter 總量與預設影像參數。`}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-8 text-right font-mono text-[10px] text-zinc-500">{LUMINANCE_MIN_NITS}</span>
                  <input
                    type="range"
                    min="0"
                    max={LUMINANCE_SLIDER_MAX}
                    step="1"
                    value={luminanceToSliderValue(settings.lmax)}
                    onChange={handleLmaxChange}
                    className="gsdf-range flex-1"
                  />
                  <span className="w-8 text-left font-mono text-[10px] text-zinc-500">{LUMINANCE_MAX_NITS}</span>
                </div>
              </section>

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

                    <GSDFStripeTest settings={settings} setSettings={setSettings} />
            </>
          )}

          {activeTab === 'advanced' && (
            <>
              <div className="grid grid-cols-2 gap-3">
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

                <SliderControl
                  disabled={!settings.enabled}
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
                  disabled={!settings.enabled}
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
                    label="白位"
                    valueText={`${settings.whitePoint}%`}
                    min={80}
                    max={100}
                    value={settings.whitePoint}
                    onChange={(value) => setNumericSetting('whitePoint', value)}
                  />
                </div>

                <SliderControl
                  disabled={!settings.enabled}
                  icon={<Activity size={14} />}
                  label="細節銳化"
                  valueText={`${settings.sharpness}%`}
                  minLabel="0"
                  maxLabel="100"
                  min={0}
                  max={100}
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
              </div>

              <ContrastChartPanel settings={settings} />
            </>
          )}
        </div>
      </div>

    </motion.div>
  );
}
