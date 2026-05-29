import React from 'react';
import { motion, useDragControls } from 'motion/react';
import { Activity, Eye, Gauge, RotateCcw, Save, Settings, SlidersHorizontal, Sun, Thermometer } from 'lucide-react';
import {
  AppSettings,
  buildGsdfStripeRows,
  clampInputGamma,
  DEFAULT_APP_SETTINGS,
  formatLuminance,
  INPUT_GAMMA_MAX,
  INPUT_GAMMA_MIN,
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

interface NumberControlProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('button, input, label, select, textarea, a, [role="button"], [data-no-drag]'));
}

function NumberControl({
  icon,
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: NumberControlProps) {
  const displayValue = Number(value.toFixed(2));

  return (
    <div className={`space-y-3 transition-opacity ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex justify-between items-center gap-4">
        <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
          <div className="flex items-center justify-center w-5">
            {icon}
          </div>
          {label}
        </label>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={(event) => {
            const nextValue = Number.parseFloat(event.target.value);
            if (Number.isFinite(nextValue)) {
              onChange(nextValue);
            }
          }}
          className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-right font-mono text-sm text-sky-400 outline-none transition-colors focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          aria-label={label}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600">
        <span>{min.toFixed(1)}</span>
        <span>{max.toFixed(1)}</span>
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

function GSDFStripeTest({ lmax, inputGamma, enabled }: { lmax: number; inputGamma: number; enabled: boolean }) {
  const rows = React.useMemo(() => buildGsdfStripeRows(lmax, inputGamma), [lmax, inputGamma]);

  return (
    <section className={`space-y-3 transition-opacity ${enabled ? 'opacity-100' : 'opacity-40'}`}>
      <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold flex items-center gap-3">
        <div className="flex items-center justify-center w-5">
          <Eye size={15} className="text-sky-400" />
        </div>
        GSDF 條紋測試
      </label>
      <div className="bg-[#07090b] border border-white/5 rounded-lg p-3 space-y-2 overflow-hidden">
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[42px_1fr] items-center gap-3">
            <span className="text-[9px] text-slate-500 font-mono tracking-wider">{row.label}</span>
            <div
              className="h-9 rounded border border-white/5 shadow-inner"
              style={{
                backgroundImage: `repeating-linear-gradient(90deg, rgb(${row.left} ${row.left} ${row.left}) 0 8px, rgb(${row.right} ${row.right} ${row.right}) 8px 16px)`,
              }}
            />
          </div>
        ))}
      </div>
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

  const setNumericSetting = (
    key: keyof Pick<AppSettings, 'inputGamma' | 'strength' | 'blackPoint' | 'whitePoint' | 'sharpness' | 'temperature'>,
    value: number,
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'inputGamma') {
        next.inputGamma = clampInputGamma(value);
      }
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

              <GSDFStripeTest lmax={settings.lmax} inputGamma={settings.inputGamma} enabled={settings.enabled} />
            </>
          )}

          {activeTab === 'advanced' && (
            <>
              <SliderControl
                disabled={!settings.enabled}
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

              <NumberControl
                disabled={!settings.enabled}
                icon={<Gauge size={15} className="text-sky-400" />}
                label="起始 Gamma"
                value={settings.inputGamma}
                min={INPUT_GAMMA_MIN}
                max={INPUT_GAMMA_MAX}
                step={0.05}
                onChange={(value) => setNumericSetting('inputGamma', value)}
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
                  <GSDFChart
                    enabled={settings.enabled}
                    lmax={settings.lmax}
                    strength={settings.strength}
                    inputGamma={settings.inputGamma}
                  />
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
