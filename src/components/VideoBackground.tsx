import React from 'react';
import { AppSettings, getLowLuminanceRatio } from '../types';

interface VideoBackgroundProps {
  settings: AppSettings;
}

export function VideoBackground({ settings }: VideoBackgroundProps) {
  const strengthRatio = settings.strength / 100;
  const lowLuminanceRatio = getLowLuminanceRatio(settings.lmax);
  const exponent = settings.enabled ? Math.max(0.55, Math.min(1.55, 1.0 + lowLuminanceRatio * 0.45 * strengthRatio)) : 1.0;
  const blackPoint = settings.blackPoint / 100;
  const whitePoint = settings.whitePoint / 100;
  const usableRange = Math.max(0.05, whitePoint - blackPoint);
  const slope = 1 / usableRange;
  const intercept = -blackPoint / usableRange;
  const temperatureRatio = settings.temperature / 50;
  const redGain = Math.max(0.78, Math.min(1.22, 1 + temperatureRatio * 0.16));
  const greenGain = Math.max(0.92, Math.min(1.08, 1 + temperatureRatio * 0.035));
  const blueGain = Math.max(0.78, Math.min(1.22, 1 - temperatureRatio * 0.16));
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
            <feFuncR type="gamma" amplitude="1" exponent={exponent} offset="0" />
            <feFuncG type="gamma" amplitude="1" exponent={exponent} offset="0" />
            <feFuncB type="gamma" amplitude="1" exponent={exponent} offset="0" />
          </feComponentTransfer>
        </filter>
        <filter id="eotf-temp" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`${redGain} 0 0 0 0  0 ${greenGain} 0 0 0  0 0 ${blueGain} 0 0  0 0 0 1 0`}
          />
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
          filter: settings.enabled ? `${sharpnessFilter} url(#eotf-levels) url(#eotf-filter) url(#eotf-temp)`.trim() : 'none',
          transition: 'filter 0.3s ease-in-out'
        }}
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
      />
    </div>
  );
}
