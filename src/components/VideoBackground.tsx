import React from 'react';
import {
  AppSettings,
  buildActiveTransferTableValues,
  buildLumaChromaMatrices,
  DEFAULT_DITHER_STRENGTH,
  DITHER_STRENGTH_MAX,
  DITHER_STRENGTH_MIN,
  TEMPERATURE_MAX_K,
  TONE_LEVEL_COUNT,
} from '../types';

interface VideoBackgroundProps {
  settings: AppSettings;
}

function getDitherCompositeAttributes(enabled: boolean, strength: number) {
  if (!enabled) {
    return { k3: 0, k4: 0 };
  }

  const codeAmplitude = Math.max(DITHER_STRENGTH_MIN, Math.min(DITHER_STRENGTH_MAX, Number.isFinite(strength) ? Math.round(strength) : DEFAULT_DITHER_STRENGTH));
  return {
    k3: Number((codeAmplitude / 255).toFixed(5)),
    k4: Number((-codeAmplitude / 510).toFixed(5)),
  };
}

export function VideoBackground({ settings }: VideoBackgroundProps) {
  const transferTableValues = React.useMemo(() => buildActiveTransferTableValues(settings).join(' '), [settings]);
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
  const ditherActive = settings.dither && (settings.ditherColor || settings.ditherNoise);
  const ditherFilter = ditherActive ? 'url(#eotf-dither)' : '';
  const ditherNoiseComposite = getDitherCompositeAttributes(ditherActive && settings.ditherNoise, settings.ditherStrength);
  const ditherColorComposite = getDitherCompositeAttributes(ditherActive && settings.ditherColor, settings.ditherStrength);

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
            <feFuncR type="table" tableValues={transferTableValues} />
            <feFuncG type="table" tableValues={transferTableValues} />
            <feFuncB type="table" tableValues={transferTableValues} />
          </feComponentTransfer>
        </filter>
        <filter id="eotf-gsdf-ycbcr" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={gsdfForwardMatrix}
            result="gsdf-ycc"
          />
          <feComponentTransfer in="gsdf-ycc" result="gsdf-ycbcr-adjusted">
            <feFuncR type="table" tableValues={transferTableValues} />
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
            <feFuncR type="table" tableValues={transferTableValues} />
            <feFuncG type="table" tableValues={transferTableValues} />
            <feFuncB type="table" tableValues={transferTableValues} />
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
        <filter id="eotf-dither" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.75 0.75" numOctaves="1" seed="17" stitchTiles="stitch" result="dither-noise" />
          <feColorMatrix
            in="dither-noise"
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 0 1"
            result="dither-luma"
          />
          <feComposite
            in="SourceGraphic"
            in2="dither-luma"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3={ditherNoiseComposite.k3}
            k4={ditherNoiseComposite.k4}
            result="dither-noise-applied"
          />
          <feComposite
            in="dither-noise-applied"
            in2="dither-noise"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3={ditherColorComposite.k3}
            k4={ditherColorComposite.k4}
          />
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
            ? `${sharpnessFilter} ${transferFilter} url(#eotf-levels) url(#eotf-temp) url(#eotf-color) ${ditherFilter}`.trim()
            : 'none',
          transition: 'filter 0.3s ease-in-out'
        }}
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
      />
    </div>
  );
}
