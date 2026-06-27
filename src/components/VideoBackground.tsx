import React from 'react';
import {
  AppSettings,
  buildGsdfTableValues,
  buildLumaChromaMatrices,
  TEMPERATURE_MAX_K,
  TONE_LEVEL_COUNT,
} from '../types';

interface VideoBackgroundProps {
  settings: AppSettings;
}

export function VideoBackground({ settings }: VideoBackgroundProps) {
  const gsdfTableValues = React.useMemo(() => buildGsdfTableValues(settings).join(' '), [settings]);
  const gsdfLumaChromaMatrices = React.useMemo(() => buildLumaChromaMatrices(settings.displayGamut), [settings.displayGamut]);
  const gsdfForwardMatrix = React.useMemo(() => gsdfLumaChromaMatrices.forward.map((value) => Number(value).toFixed(4)).join(' '), [gsdfLumaChromaMatrices]);
  const gsdfInverseMatrix = React.useMemo(() => gsdfLumaChromaMatrices.inverse.map((value) => Number(value).toFixed(4)).join(' '), [gsdfLumaChromaMatrices]);
  const blackPoint = settings.blackPoint / TONE_LEVEL_COUNT;
  const whitePoint = settings.whitePoint / TONE_LEVEL_COUNT;
  const usableRange = Math.max(0.05, whitePoint - blackPoint);
  const slope = 1 / usableRange;
  const intercept = -blackPoint / usableRange;
  const temperatureRatio = settings.temperature / TEMPERATURE_MAX_K;
  const redGain = Math.max(0.82, Math.min(1.18, 1 + temperatureRatio * 0.14));
  const greenGain = Math.max(0.94, Math.min(1.06, 1 + temperatureRatio * 0.025));
  const blueGain = Math.max(0.82, Math.min(1.18, 1 - temperatureRatio * 0.14));
  const saturation = settings.grayscale ? 0 : Math.max(0.5, Math.min(1.5, settings.saturation / 100));
  const hue = Math.max(-30, Math.min(30, settings.hue));
  const fineSharpenAmount = Math.max(0, Math.min(50, settings.fineSharpness)) / 180;
  const mediumSharpenAmount = Math.max(0, Math.min(40, settings.mediumSharpness)) / 250;
  const fineSharpenKernel = `0 ${-fineSharpenAmount} 0 ${-fineSharpenAmount} ${1 + fineSharpenAmount * 4} ${-fineSharpenAmount} 0 ${-fineSharpenAmount} 0`;
  const mediumSharpenKernel = [
    0, 0, -mediumSharpenAmount, 0, 0,
    0, -mediumSharpenAmount, 0, -mediumSharpenAmount, 0,
    -mediumSharpenAmount, 0, 1 + mediumSharpenAmount * 8, 0, -mediumSharpenAmount,
    0, -mediumSharpenAmount, 0, -mediumSharpenAmount, 0,
    0, 0, -mediumSharpenAmount, 0, 0,
  ].join(' ');
  const sharpnessFilter = [
    settings.fineSharpness > 0 ? 'url(#eotf-sharpen-fine)' : '',
    settings.mediumSharpness > 0 ? 'url(#eotf-sharpen-medium)' : '',
  ].filter(Boolean).join(' ');
  const gsdfFilter = settings.gsdfPipeline === 'rgb' ? 'url(#eotf-gsdf-rgb)' : 'url(#eotf-gsdf-ycbcr)';
  const transferFilter = settings.transferFormula === 'csdf' ? 'url(#eotf-csdf)' : gsdfFilter;

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
        <filter id="eotf-gsdf-rgb" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues={gsdfTableValues} />
            <feFuncG type="table" tableValues={gsdfTableValues} />
            <feFuncB type="table" tableValues={gsdfTableValues} />
          </feComponentTransfer>
        </filter>
        <filter id="eotf-gsdf-ycbcr" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={gsdfForwardMatrix}
            result="gsdf-ycc"
          />
          <feComponentTransfer in="gsdf-ycc" result="gsdf-ycbcr-adjusted">
            <feFuncR type="table" tableValues={gsdfTableValues} />
            <feFuncG type="linear" slope={1} intercept={0} />
            <feFuncB type="linear" slope={1} intercept={0} />
          </feComponentTransfer>
          <feColorMatrix
            in="gsdf-ycbcr-adjusted"
            type="matrix"
            values={gsdfInverseMatrix}
          />
        </filter>
        <filter id="eotf-csdf" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={1} intercept={0} />
            <feFuncG type="linear" slope={1} intercept={0} />
            <feFuncB type="linear" slope={1} intercept={0} />
          </feComponentTransfer>
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
        <filter id="eotf-sharpen-fine">
          <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix={fineSharpenKernel} />
        </filter>
        <filter id="eotf-sharpen-medium">
          <feConvolveMatrix order="5" preserveAlpha="true" kernelMatrix={mediumSharpenKernel} />
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
            ? `${sharpnessFilter} ${transferFilter} url(#eotf-levels) url(#eotf-temp) url(#eotf-color)`.trim()
            : 'none',
          transition: 'filter 0.3s ease-in-out'
        }}
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
      />
    </div>
  );
}
