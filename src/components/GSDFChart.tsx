import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { AppSettings, buildGsdfTableValues } from '../types';

interface GSDFChartProps {
  settings: AppSettings;
}

export function GSDFChart({ settings }: GSDFChartProps) {
  const [layoutReady, setLayoutReady] = useState(false);
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

  return (
    <div className="w-full h-48 text-xs select-none">
      {layoutReady && (
        <LineChart width={291} height={192} data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={true} />
          <XAxis 
            dataKey="pixelValue" 
            type="number" 
            domain={[0, 255]} 
            tickCount={5}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <YAxis 
            domain={[0, 1]} 
            tickCount={5}
            stroke="#475569"
            tick={{ fill: '#64748b', fontSize: 10 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#121417', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
            itemStyle={{ fontSize: '11px' }}
            labelStyle={{ display: 'none' }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#94a3b8', paddingTop: '10px' }} />
          <Line 
            type="monotone" 
            dataKey="sRGB" 
            stroke="rgba(255,255,255,0.15)" 
            strokeWidth={1.5} 
            dot={false} 
            name="Standard sRGB" 
            isAnimationActive={false}
          />
          {settings.enabled && (
             <Line 
               type="monotone" 
               dataKey="GSDF_Simulated" 
               stroke="#0ea5e9" 
               strokeWidth={2} 
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
