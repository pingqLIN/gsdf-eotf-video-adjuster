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

interface DraggablePanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  extensionMode?: boolean;
  onExtensionDrag?: (deltaX: number, deltaY: number) => void;
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

function StatusDeck({ settings }: { settings: AppSettings }) {
  const statusLabel = settings.enabled ? 'ACTIVE' : 'STANDBY';

  return (
    <section className="rounded-md border border-white/10 bg-[#0a0e13] p-3.5 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400">
            {settings.enabled ? <CheckCircle2 size={14} className="text-emerald-300" /> : <CircleOff size={14} className="text-zinc-500" />}
            <span>{statusLabel}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[34px] leading-none text-zinc-50 tabular-nums">{formatLuminance(settings.lmax)}</span>
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

function GSDFStripeTest({ settings }: { settings: AppSettings }) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [showFullPattern, setShowFullPattern] = React.useState(false);
  const compactStripeWidth = 18;
  const outputRows = React.useMemo(() => buildGsdfStripeRows(settings), [settings]);
  const calibrationRows = React.useMemo(() => buildGsdfCalibrationStripeRows(), []);
  const frequencies = React.useMemo(
    () => [
      { label: '1', stripeWidth: 40 },
      { label: '2', stripeWidth: 28 },
      { label: '4', stripeWidth: 20 },
      { label: '8', stripeWidth: 14 },
      { label: '12', stripeWidth: 10 },
      { label: '16', stripeWidth: 7 },
    ],
    [],
  );

  React.useEffect(() => {
    if (!window.parent || window.parent === window) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_PATTERN_VIEW_CHANGED',
      payload: { open: showFullPattern },
    }, '*');

    return () => {
      window.parent.postMessage({
        type: 'GSDF_PATTERN_VIEW_CHANGED',
        payload: { open: false },
      }, '*');
    };
  }, [showFullPattern]);

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

  const renderFrequencyMatrix = (rows: ReturnType<typeof buildGsdfStripeRows>) => (
    <div className="space-y-2">
      <div className="grid grid-cols-[42px_repeat(6,minmax(72px,1fr))] gap-2 font-mono text-[8px] uppercase tracking-wider text-zinc-500">
        <div />
        {frequencies.map((frequency) => (
          <div key={frequency.label} className="text-center">{frequency.label}x</div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[42px_repeat(6,minmax(72px,1fr))] items-center gap-2">
          <span className="font-mono text-[9px] tracking-wider text-zinc-500">{row.label}</span>
          {frequencies.map((frequency) => (
            <div
              key={`${row.id}-${frequency.label}`}
              className="h-14 rounded border border-white/[0.06] shadow-inner"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, rgb(${row.left} ${row.left} ${row.left}) 0 ${frequency.stripeWidth}px, rgb(${row.right} ${row.right} ${row.right}) ${frequency.stripeWidth}px ${frequency.stripeWidth * 2}px)`,
              }}
            />
          ))}
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
        <div className="fixed inset-3 z-[80] flex flex-col overflow-hidden rounded-md border border-white/10 bg-[#0b0e12] shadow-2xl" data-no-drag>
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10 bg-[#111820] px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold text-zinc-200">完整多頻率條紋圖</div>
              <div className="font-mono text-[9px] text-zinc-500">frequency columns: 1x / 2x / 4x / 8x / 12x / 16x</div>
            </div>
            <button
              type="button"
              title="關閉"
              onClick={() => setShowFullPattern(false)}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 space-y-5 overflow-auto p-4">
            <div className="space-y-3">
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">輸出預覽</div>
              {renderFrequencyMatrix(outputRows)}
            </div>
            <div className="space-y-3">
              <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">亮度校準</div>
              {renderFrequencyMatrix(calibrationRows)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ChartCaption({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.03] ${compact ? 'p-3' : 'p-4'}`}>
      <div className="text-[11px] font-semibold text-zinc-200">圖說</div>
      <div className="mt-2 space-y-1.5 font-mono text-[10px] leading-relaxed text-zinc-400">
        <div><span className="text-zinc-200">X axis</span>: 8-bit input pixel value, 0 to 255.</div>
        <div><span className="text-zinc-200">Y axis</span>: normalized transfer-table output, 0 to 1.</div>
        <div><span className="text-cyan-200">GSDF-Optimized</span>: gamma target first, then full GSDF table blended by the filter amount.</div>
        <div><span className="text-zinc-200">Standard sRGB</span>: neutral reference line for comparison.</div>
      </div>
    </div>
  );
}

function ContrastChartPanel({ settings }: { settings: AppSettings }) {
  const [showFullChart, setShowFullChart] = React.useState(false);

  React.useEffect(() => {
    if (!window.parent || window.parent === window) {
      return;
    }

    window.parent.postMessage({
      type: 'GSDF_PATTERN_VIEW_CHANGED',
      payload: { open: showFullChart },
    }, '*');

    return () => {
      window.parent.postMessage({
        type: 'GSDF_PATTERN_VIEW_CHANGED',
        payload: { open: false },
      }, '*');
    };
  }, [showFullChart]);

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
        <div className="fixed inset-3 z-[80] flex flex-col overflow-hidden rounded-md border border-white/10 bg-[#0b0e12] shadow-2xl" data-no-drag>
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10 bg-[#111820] px-4 py-3">
            <div>
              <div className="text-[12px] font-semibold text-zinc-100">完整 GSDF transfer curve</div>
              <div className="font-mono text-[9px] text-zinc-500">input pixel value vs normalized table output</div>
            </div>
            <button
              type="button"
              title="關閉"
              onClick={() => setShowFullChart(false)}
              className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid min-h-full grid-cols-[minmax(0,1fr)_260px] gap-4">
              <div className="rounded-md border border-white/10 bg-[#080b0f] p-4">
                <React.Suspense fallback={<div className="h-[420px]" />}>
                  <GSDFChart settings={settings} className="h-[420px]" />
                </React.Suspense>
              </div>
              <ChartCaption />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function DraggablePanel({
  settings,
  setSettings,
  extensionMode = false,
  onExtensionDrag,
}: DraggablePanelProps) {
  const dragControls = useDragControls();
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = React.useState<PanelTab>('basic');

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
      className={`${extensionMode ? 'relative' : 'absolute'} top-0 left-0 z-50 flex h-[680px] max-h-[calc(100vh-16px)] w-[400px] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#111418] font-sans text-zinc-200 shadow-2xl`}
    >
      <div
        className="flex cursor-grab select-none items-center justify-between border-b border-white/10 bg-[#181c21] px-5 py-3.5 active:cursor-grabbing"
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
        <label
          className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-md border border-white/10 bg-[#0b0d10] p-1"
          title="啟動 EOTF 修正"
          data-no-drag
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

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pt-4">
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

        <div className="flex-1 space-y-4 overflow-hidden p-5">
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

              <GSDFStripeTest settings={settings} />
            </>
          )}

          {activeTab === 'advanced' && (
            <>
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

              <div className={`grid grid-cols-2 gap-4 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-45 pointer-events-none'}`}>
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

              <ContrastChartPanel settings={settings} />
            </>
          )}
        </div>
      </div>

    </motion.div>
  );
}
