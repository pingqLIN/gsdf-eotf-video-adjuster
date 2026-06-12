import React from 'react';
import { AppSettings, buildGsdfTableValues } from '../types';

interface VideoBackgroundProps {
  settings: AppSettings;
}

export function VideoBackground({ settings }: VideoBackgroundProps) {
  const gsdfTableValues = React.useMemo(() => buildGsdfTableValues(settings).join(' '), [settings]);
  const blackPoint = settings.blackPoint / 100;
  const whitePoint = settings.whitePoint / 100;
  const usableRange = Math.max(0.05, whitePoint - blackPoint);
  const slope = 1 / usableRange;
  const intercept = -blackPoint / usableRange;
  const temperatureRatio = settings.temperature / 50;
  const redGain = Math.max(0.78, Math.min(1.22, 1 + temperatureRatio * 0.16));
  const greenGain = Math.max(0.92, Math.min(1.08, 1 + temperatureRatio * 0.035));
  const blueGain = Math.max(0.78, Math.min(1.22, 1 - temperatureRatio * 0.16));
  const saturation = Math.max(0, Math.min(2, settings.saturation / 100));
  const hue = Math.max(-180, Math.min(180, settings.hue));
  const sharpnessFilter = settings.sharpness < 15 ? '' : settings.sharpness < 35 ? 'url(#eotf-sharpen-1)' : settings.sharpness < 65 ? 'url(#eotf-sharpen-2)' : 'url(#eotf-sharpen-3)';

  return (
    <div className="fixed inset-0 w-full h-full bg-black overflow-hidden select-none pointer-events-none">
      <svg className="hidden">
        <filter id="eotf-levels" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={slope} intercept={intercept} />
            <feFuncG type="linear" slope={slope} intercept={intercept} />
            <feFuncB type="linear" slope={slope} intercept={intercept} />
          </feComponentTransfer>
        </filter>
        <filter id="eotf-filter" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues={gsdfTableValues} />
            <feFuncG type="table" tableValues={gsdfTableValues} />
            <feFuncB type="table" tableValues={gsdfTableValues} />
          </feComponentTransfer>
        </filter>
        <filter id="eotf-ycbcr" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0  -0.1146 -0.3854 0.5000 0 0.5  0.5000 -0.4542 -0.0458 0 0.5  0 0 0 1 0"
            result="ycbcr"
          />
          <feComponentTransfer in="ycbcr" result="yAdjusted">
            <feFuncR type="table" tableValues={gsdfTableValues} />
            <feFuncG type="linear" slope="1" intercept="0" />
            <feFuncB type="linear" slope="1" intercept="0" />
          </feComponentTransfer>
          <feColorMatrix
            in="yAdjusted"
            type="matrix"
            values="1 0 1.5748 0 -0.7874  1 -0.1873 -0.4681 0 0.3277  1 1.8556 0 0 -0.9278  0 0 0 1 0"
          />
        </filter>
        <filter id="eotf-temp" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`${redGain} 0 0 0 0  0 ${greenGain} 0 0 0  0 0 ${blueGain} 0 0  0 0 0 1 0`}
          />
        </filter>
        <filter id="eotf-color" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values={String(saturation)} />
          <feColorMatrix type="hueRotate" values={String(hue)} />
        </filter>
        <filter id="eotf-sharpen-1">
          <feConvolveMatrix order="3" kernelMatrix="0 -0.22 0 -0.22 1.88 -0.22 0 -0.22 0" />
        </filter>
        <filter id="eotf-sharpen-2">
          <feConvolveMatrix order="3" kernelMatrix="0 -0.38 0 -0.38 2.52 -0.38 0 -0.38 0" />
        </filter>
        <filter id="eotf-sharpen-3">
          <feConvolveMatrix order="3" kernelMatrix="0 -0.55 0 -0.55 3.20 -0.55 0 -0.55 0" />
        </filter>
      </svg>
      {/* Big Buck Bunny standard test video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        crossOrigin="anonymous"
        className="w-full h-full object-cover"
        style={{
          filter: settings.enabled
            ? `${sharpnessFilter} url(#eotf-levels) url(#${settings.colorModel === 'ycbcr' ? 'eotf-ycbcr' : 'eotf-filter'}) url(#eotf-temp) url(#eotf-color)`.trim()
            : 'none',
          transition: 'filter 0.3s ease-in-out'
        }}
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
      />
    </div>
  );
}
