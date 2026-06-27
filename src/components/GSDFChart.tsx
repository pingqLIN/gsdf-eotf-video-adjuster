import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { Messages } from '../i18n';
import { AppSettings, buildGsdfTableValues, TONE_LEVEL_COUNT } from '../types';

interface GSDFChartProps {
  settings: AppSettings;
  panelTheme?: 'dark' | 'light';
  messages: Messages;
  className?: string;
}

export function GSDFChart({ settings, panelTheme = 'dark', messages, className = 'h-48' }: GSDFChartProps) {
  const [layoutReady, setLayoutReady] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<HTMLDivElement | null>(null);
  const [includeLevels, setIncludeLevels] = useState(false);
  const [chartSize, setChartSize] = useState({ width: 0, height: 192 });
  const isLightTheme = panelTheme === 'light';
  const palette = isLightTheme
    ? {
        grid: 'rgba(15, 23, 42, 0.24)',
        axis: '#334155',
        axisText: '#1f2937',
        tooltipBg: '#f8fafc',
        tooltipText: '#0f172a',
        tooltipBorder: 'rgba(15, 23, 42, 0.3)',
        srgbLine: '#475569',
        gsdfLine: '#0284c7',
        srgbLineWidth: 1.9,
        gsdfLineWidth: 2.6,
        legendText: '#1f2937',
      }
    : {
        grid: 'rgba(255,255,255,0.05)',
        axis: '#52525b',
        axisText: '#71717a',
        tooltipBg: '#121417',
        tooltipText: '#f8fafc',
        tooltipBorder: 'rgba(255,255,255,0.1)',
        srgbLine: '#334155',
        gsdfLine: '#22d3ee',
        srgbLineWidth: 1.5,
        gsdfLineWidth: 2,
        legendText: '#a1a1aa',
      };
  const data = useMemo(() => {
    const arr = [];
    const table = buildGsdfTableValues(settings);
    const blackPoint = settings.blackPoint / TONE_LEVEL_COUNT;
    const whitePoint = settings.whitePoint / TONE_LEVEL_COUNT;
    const usableRange = Math.max(0.05, whitePoint - blackPoint);
    const applyOutputLevels = (value: number) => {
      if (!includeLevels) {
        return value;
      }

      return Math.max(0, Math.min(1, (value - blackPoint) / usableRange));
    };

    for (let i = 0; i <= 255; i += 15) {
      const v = i / 255;
      const mappedValue = table[i] ?? v;
      arr.push({
        pixelValue: i,
        sRGB: v,
        GSDF_Simulated: applyOutputLevels(mappedValue),
      });
    }
    // ensure the last point is strictly 255
    const lastValue = table[255] ?? 1.0;
    arr.push({
      pixelValue: 255,
      sRGB: 1.0,
      GSDF_Simulated: applyOutputLevels(lastValue),
    });
    return arr;
  }, [includeLevels, settings]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setLayoutReady(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return undefined;
    }

    const updateSize = () => {
      const rect = chart.getBoundingClientRect();
      setChartSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(chart);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`flex w-full flex-col text-xs select-none ${className}`}>
      <div className="mb-1 flex h-6 shrink-0 items-center justify-end">
        <label
          title={messages.chart.includeLevelsTitle}
          className="gsdf-inline-checkbox flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-zinc-400"
        >
          <span>{messages.chart.includeLevels}</span>
          <input
            type="checkbox"
            checked={includeLevels}
            onChange={(event) => setIncludeLevels(event.target.checked)}
            aria-label={messages.chart.includeLevels}
            className="gsdf-checkbox h-4 w-4 shrink-0"
          />
        </label>
      </div>
      <div ref={chartRef} className="min-h-0 flex-1">
        {layoutReady && chartSize.width > 1 && chartSize.height > 1 && (
        <LineChart width={chartSize.width} height={chartSize.height} data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={true} />
          <XAxis
            dataKey="pixelValue"
            type="number"
            domain={[0, 255]}
            tickCount={5}
            stroke={palette.axis}
            tick={{ fill: palette.axisText, fontSize: 10 }}
            axisLine={{ stroke: palette.axis }}
            tickLine={{ stroke: palette.axis }}
          />
          <YAxis
            domain={[0, 1]}
            tickCount={5}
            stroke={palette.axis}
            tick={{ fill: palette.axisText, fontSize: 10 }}
            axisLine={{ stroke: palette.axis }}
            tickLine={{ stroke: palette.axis }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: palette.tooltipBg,
              color: palette.tooltipText,
              border: `1px solid ${palette.tooltipBorder}`,
              borderRadius: '6px',
              fontSize: '11px',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
            }}
            itemStyle={{ fontSize: '11px' }}
            labelStyle={{ display: 'none' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: palette.legendText, paddingTop: '10px' }} />
          <Line
            type="monotone"
            dataKey="sRGB"
            stroke={palette.srgbLine}
            strokeWidth={palette.srgbLineWidth}
            dot={false}
            name={messages.chart.standardSrgb}
            isAnimationActive={false}
          />
          {settings.enabled && (
            <Line
              type="monotone"
              dataKey="GSDF_Simulated"
              stroke={palette.gsdfLine}
              strokeWidth={palette.gsdfLineWidth}
              dot={false}
              name={messages.chart.gsdfOptimized}
              isAnimationActive={false}
            />
          )}
        </LineChart>
        )}
      </div>
    </div>
  );
}
