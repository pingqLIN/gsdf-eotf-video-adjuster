import React from 'react';
import { motion, useDragControls } from 'motion/react';
import { Activity, Eye, Gauge, Grid3X3, RotateCcw, Save, Settings, SlidersHorizontal, Sun, Thermometer, X } from 'lucide-react';
import {
  AppSettings,
  buildGsdfCalibrationStripeRows,
  buildGsdfStripeRows,
  DEFAULT_APP_SETTINGS,
  formatLuminance,
  LUMINANCE_MAX_NITS,
  LUMINANCE_MIN_NITS,
  LUMINANCE_SLIDER_MAX,
  luminanceToSliderValue,
  sliderValueToLuminance,
} from '../types';
import { GSDFChart } from './GSDFChart';

type PanelTab = 'basic' | 'advanced';

interface DraggablePanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onSaveDefault: () => void;
  extensionMode?: boolean;
  onExtensionDrag?: (deltaX: number, deltaY: number) => void;
}

interface SliderControlProps {
  icon: React.ReactNode;
  label: string;
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
  label: string;
  value: T;
  options: Array<{ value: T; label: string; title: string }>;
  disabled?: boolean;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={`space-y-3 transition-opacity ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
        <div className="flex items-center justify-center w-5">
          <SlidersHorizontal size={15} className="text-sky-400" />
        </div>
        {label}
      </label>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 border border-white/5 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-md text-[11px] font-bold tracking-wider transition-colors ${
              value === option.value
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-950/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
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
    <div className={`space-y-3 transition-opacity ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex justify-between items-end gap-4">
        <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
          <div className="flex items-center justify-center w-5">
            {icon}
          </div>
          {label}
        </label>
        <div className="text-lg font-mono text-sky-400 font-light tabular-nums whitespace-nowrap">
          {valueText}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {minLabel && <span className="text-[9px] text-slate-600 w-8 text-right">{minLabel}</span>}
        <div className="flex-1 relative flex items-center">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(parseInt(event.target.value, 10))}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>
        {maxLabel && <span className="text-[9px] text-slate-600 w-8 text-left">{maxLabel}</span>}
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

function GSDFStripeTest({ settings }: { settings: AppSettings }) {
  const [showFullPattern, setShowFullPattern] = React.useState(false);
  const compactStripeWidth = 14;
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

  const renderRows = (rows: ReturnType<typeof buildGsdfStripeRows>) => (
    <div className="bg-[#07090b] border border-white/5 rounded-lg p-3 space-y-2 overflow-hidden">
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[42px_1fr] items-center gap-3">
          <span className="text-[9px] text-slate-500 font-mono tracking-wider">{row.label}</span>
          <div
            className="h-9 rounded border border-white/5 shadow-inner"
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
      <div className="grid grid-cols-[42px_repeat(6,minmax(72px,1fr))] gap-2 text-[8px] uppercase tracking-wider text-slate-600">
        <div />
        {frequencies.map((frequency) => (
          <div key={frequency.label} className="text-center">{frequency.label}x</div>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[42px_repeat(6,minmax(72px,1fr))] gap-2 items-center">
          <span className="text-[9px] text-slate-500 font-mono tracking-wider">{row.label}</span>
          {frequencies.map((frequency) => (
            <div
              key={`${row.id}-${frequency.label}`}
              className="h-14 rounded border border-white/5 shadow-inner"
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
    <section className={`space-y-3 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-40'}`}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
          <div className="flex items-center justify-center w-5">
            <Eye size={15} className="text-sky-400" />
          </div>
          GSDF 條紋測試
        </label>
        <button
          type="button"
          title="開啟完整多頻率條紋圖"
          onClick={() => setShowFullPattern(true)}
          className="p-1.5 rounded text-slate-500 hover:text-sky-400 hover:bg-white/5 transition-colors"
          data-no-drag
        >
          <Grid3X3 size={14} />
        </button>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">輸出預覽</div>
          {renderRows(outputRows)}
        </div>
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">亮度校準</div>
          {renderRows(calibrationRows)}
        </div>
      </div>
      {showFullPattern && (
        <div className="fixed inset-3 z-[80] flex flex-col rounded-xl border border-white/10 bg-[#0b0e12] shadow-2xl overflow-hidden" data-no-drag>
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">完整多頻率條紋圖</div>
              <div className="text-[9px] text-slate-600 font-mono">frequency columns: 1x / 2x / 4x / 8x / 12x / 16x</div>
            </div>
            <button
              type="button"
              title="關閉"
              onClick={() => setShowFullPattern(false)}
              className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div className="space-y-3">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">輸出預覽</div>
              {renderFrequencyMatrix(outputRows)}
            </div>
            <div className="space-y-3">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">亮度校準</div>
              {renderFrequencyMatrix(calibrationRows)}
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
  onSaveDefault,
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

  const setModeSetting = <K extends keyof Pick<AppSettings, 'curveMode' | 'colorModel'>>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const setNumericSetting = (key: keyof Pick<AppSettings, 'strength' | 'blackPoint' | 'whitePoint' | 'sharpness' | 'temperature'>, value: number) => {
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
      className={`${extensionMode ? 'relative' : 'absolute'} top-0 left-0 w-[380px] max-h-[calc(100vh-48px)] bg-[#121417] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-slate-200 z-50 flex flex-col font-sans`}
    >
      {/* Draggable Header */}
      <div 
        className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/5 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-5">
            <Settings size={16} className="text-sky-500 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-white">GSDF EOTF Adjuster</span>
        </div>
        <label
          className="relative inline-block w-10 h-6 align-middle select-none transition duration-200 ease-in"
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
            className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in-out"
            style={{
              transform: settings.enabled ? 'translateX(100%)' : 'translateX(0)',
              borderColor: settings.enabled ? '#0ea5e9' : '#334155',
              right: '16px',
            }}
          />
          <span
            className={`toggle-label block overflow-hidden h-6 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${settings.enabled ? 'bg-sky-500' : 'bg-white/10'}`}
          />
        </label>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 border border-white/5 p-1">
            {(['basic', 'advanced'] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-9 rounded-md text-xs font-bold tracking-widest transition-colors ${
                  activeTab === tab
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-950/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab === 'basic' ? '基礎' : '進階'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          {activeTab === 'basic' && (
            <>
              <div className={`space-y-4 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="flex justify-between items-end">
                  <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
                    <div className="flex items-center justify-center w-5">
                      <Sun size={15} className="text-sky-400"/>
                    </div>
                    目標螢幕亮度 (Lmax)
                  </label>
                  <div className="text-2xl font-mono text-sky-400 font-light flex items-baseline gap-1">
                    {formatLuminance(settings.lmax)} <span className="text-[10px] text-slate-500 font-sans uppercase tracking-widest">nits</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-slate-600 w-8 text-right">{LUMINANCE_MIN_NITS}</span>
                  <div className="flex-1 relative flex items-center">
                    <input
                      type="range"
                      min="0"
                      max={LUMINANCE_SLIDER_MAX}
                      step="1"
                      value={luminanceToSliderValue(settings.lmax)}
                      onChange={handleLmaxChange}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-500"
                    />
                  </div>
                  <span className="text-[9px] text-slate-600 w-8 text-left">{LUMINANCE_MAX_NITS}</span>
                  <button
                    onClick={resetToDefault}
                    className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-white/5 rounded transition-colors ml-1"
                    title="Reset to 500"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              <GSDFStripeTest settings={settings} />
            </>
          )}

          {activeTab === 'advanced' && (
            <>
              <SegmentedControl
                disabled={!settings.enabled}
                label="曲線模式"
                value={settings.curveMode}
                options={[
                  { value: 'relative', label: '相對補償', title: '以 500 nits 為補償歸零點，低亮度逐步引入 GSDF' },
                  { value: 'pure', label: '純 GSDF', title: '不做 500 nits 中性混合，直接套用 GSDF table' },
                ]}
                onChange={(value) => setModeSetting('curveMode', value)}
              />

              <SegmentedControl
                disabled={!settings.enabled}
                label="色彩模型"
                value={settings.colorModel}
                options={[
                  { value: 'rgb', label: 'RGB', title: '對 R/G/B 三通道套同一張 GSDF table' },
                  { value: 'ycbcr', label: 'YCbCr', title: '轉成 YCbCr 後只調整 Y 亮度，保留 Cb/Cr 色度' },
                ]}
                onChange={(value) => setModeSetting('colorModel', value)}
              />

              <SliderControl
                disabled={!settings.enabled || settings.curveMode === 'pure'}
                icon={<Gauge size={15} className="text-sky-400" />}
                label="修正強度"
                valueText={`${settings.strength}%`}
                minLabel="0"
                maxLabel="100"
                min={0}
                max={100}
                step={5}
                value={settings.strength}
                onChange={(value) => setNumericSetting('strength', value)}
              />

              <div className={`grid grid-cols-2 gap-4 transition-opacity ${settings.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <SliderControl
                  icon={<SlidersHorizontal size={15} className="text-sky-400" />}
                  label="黑位"
                  valueText={`${settings.blackPoint}%`}
                  min={0}
                  max={20}
                  value={settings.blackPoint}
                  onChange={(value) => setNumericSetting('blackPoint', value)}
                />
                <SliderControl
                  icon={<Sun size={15} className="text-sky-400" />}
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
                icon={<Activity size={15} className="text-sky-400" />}
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
                icon={<Thermometer size={15} className="text-sky-400" />}
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

              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
                  <div className="flex items-center justify-center w-5">
                    <Activity size={15} className="text-sky-500" />
                  </div>
                  即時對比度分析視圖
                </label>
                <div className="bg-[#0a0a0c] border border-white/5 rounded-lg p-3">
                  <GSDFChart settings={settings} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 py-4 bg-[#121417]/95 border-t border-white/5">
        <button
          onClick={onSaveDefault}
          className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-xl text-xs tracking-wide transition-colors shadow-lg shadow-sky-900/20 focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#121417] focus:ring-sky-500"
        >
          <Save size={16} />
          儲存預設偏好設定
        </button>
      </div>
    </motion.div>
  );
}
