import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { AppSettings, buildGsdfTableValues } from '../types';

interface GSDFChartProps {
  settings: AppSettings;
  panelTheme?: 'dark' | 'light';
  className?: string;
}

export function GSDFChart({ settings, panelTheme = 'dark', className = 'h-48' }: GSDFChartProps) {
  const [layoutReady, setLayoutReady] = useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
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

    for (let i = 0; i <= 255; i += 15) {
      const v = i / 255;
      arr.push({
        pixelValue: i,
        sRGB: v,
        GSDF_Simulated: table[i] ?? v,
      });
    }
    // ensure the last point is strictly 255
    arr.push({
      pixelValue: 255,
      sRGB: 1.0,
      GSDF_Simulated: table[255] ?? 1.0,
    });
    return arr;
  }, [settings]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setLayoutReady(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setChartSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`w-full text-xs select-none ${className}`}>
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
            name="Standard sRGB"
            isAnimationActive={false}
          />
          {settings.enabled && (
            <Line
              type="monotone"
              dataKey="GSDF_Simulated"
              stroke={palette.gsdfLine}
              strokeWidth={palette.gsdfLineWidth}
              dot={false}
              name="GSDF-Optimized"
              isAnimationActive={false}
            />
          )}
        </LineChart>
      )}
    </div>
  );
}
