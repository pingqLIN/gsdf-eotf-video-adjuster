import React from 'react';
import { Gauge, Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import { TONE_LEVEL_COUNT } from '../types';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const DEFAULT_EDGE_LEVEL_COUNT = 16;

type TonePatchKind = 'neutral' | 'primary' | 'secondary';

interface TonePatchRow {
  id: string;
  label: string;
  shortLabel: string;
  kind: TonePatchKind;
  channels: [number, number, number];
}

const TONE_PATCH_ROWS: TonePatchRow[] = [
  { id: 'neutral', label: 'W/K neutral', shortLabel: 'W-K', kind: 'neutral', channels: [1, 1, 1] },
  { id: 'red', label: 'Red primary', shortLabel: 'R', kind: 'primary', channels: [1, 0, 0] },
  { id: 'green', label: 'Green primary', shortLabel: 'G', kind: 'primary', channels: [0, 1, 0] },
  { id: 'blue', label: 'Blue primary', shortLabel: 'B', kind: 'primary', channels: [0, 0, 1] },
  { id: 'cyan', label: 'Cyan complement', shortLabel: 'C', kind: 'secondary', channels: [0, 1, 1] },
  { id: 'magenta', label: 'Magenta complement', shortLabel: 'M', kind: 'secondary', channels: [1, 0, 1] },
  { id: 'yellow', label: 'Yellow complement', shortLabel: 'Y', kind: 'secondary', channels: [1, 1, 0] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatRgb(red: number, green: number, blue: number): string {
  return `rgb(${Math.round(clamp(red, 0, 255))}, ${Math.round(clamp(green, 0, 255))}, ${Math.round(clamp(blue, 0, 255))})`;
}

function getPatchColor(row: TonePatchRow, level: number): string {
  const [redScale, greenScale, blueScale] = row.channels;

  return formatRgb(level * redScale, level * greenScale, level * blueScale);
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 24,
  color = 'rgba(244, 244, 245, 0.92)',
  align: CanvasTextAlign = 'left',
) {
  context.save();
  context.font = `600 ${size}px "Cascadia Mono", "Segoe UI", monospace`;
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillStyle = color;
  context.fillText(text, x, y);
  context.restore();
}

function drawSectionLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number, width: number) {
  context.save();
  context.fillStyle = 'rgba(255, 255, 255, 0.06)';
  context.fillRect(x, y - 18, width, 36);
  context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  context.strokeRect(x, y - 18, width, 36);
  drawText(context, label, x + 16, y, 22, 'rgba(226, 232, 240, 0.9)');
  context.restore();
}

function drawPatchGrid(
  context: CanvasRenderingContext2D,
  rows: TonePatchRow[],
  x: number,
  y: number,
  width: number,
  height: number,
  levels: number[],
  phase: number,
) {
  const labelWidth = 150;
  const rowGap = 8;
  const patchGap = 2;
  const rowHeight = (height - rowGap * (rows.length - 1)) / rows.length;
  const patchWidth = (width - labelWidth - patchGap * (levels.length - 1)) / levels.length;
  const activeIndex = Math.floor(phase * levels.length) % levels.length;

  rows.forEach((row, rowIndex) => {
    const rowY = y + rowIndex * (rowHeight + rowGap);
    drawText(context, row.shortLabel, x + 16, rowY + rowHeight * 0.5, 28, 'rgba(244, 244, 245, 0.96)');
    drawText(context, row.kind.toUpperCase(), x + 70, rowY + rowHeight * 0.5, 14, 'rgba(148, 163, 184, 0.78)');

    levels.forEach((level, levelIndex) => {
      const patchX = x + labelWidth + levelIndex * (patchWidth + patchGap);
      context.fillStyle = getPatchColor(row, level);
      context.fillRect(patchX, rowY, patchWidth, rowHeight);

      context.strokeStyle = levelIndex === activeIndex ? 'rgba(255, 255, 255, 0.92)' : 'rgba(0, 0, 0, 0.5)';
      context.lineWidth = levelIndex === activeIndex ? 3 : 1;
      context.strokeRect(patchX + 0.5, rowY + 0.5, patchWidth - 1, rowHeight - 1);

      if (levelIndex % 2 === 0 || levels.length <= 16) {
        const textColor = level < 44 ? 'rgba(248, 250, 252, 0.82)' : 'rgba(3, 7, 18, 0.8)';
        drawText(context, `${level}`, patchX + patchWidth * 0.5, rowY + rowHeight * 0.5, levels.length > 16 ? 13 : 18, textColor, 'center');
      }
    });
  });
}

function drawContinuousBand(
  context: CanvasRenderingContext2D,
  row: TonePatchRow,
  x: number,
  y: number,
  width: number,
  height: number,
  startLevel: number,
  endLevel: number,
) {
  const gradient = context.createLinearGradient(x, 0, x + width, 0);
  const stepCount = Math.max(1, endLevel - startLevel);

  for (let index = 0; index <= stepCount; index += 1) {
    const level = startLevel + index;
    gradient.addColorStop(index / stepCount, getPatchColor(row, level));
  }

  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
  context.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

function drawToneLossFrame(
  context: CanvasRenderingContext2D,
  elapsedMs: number,
  options: { edgeLevelCount: number; speed: number },
) {
  const phase = ((elapsedMs / 1000) * options.speed) % 1;
  const edgeLevelCount = clamp(Math.round(options.edgeLevelCount), 8, 32);
  const lowLevels = Array.from({ length: edgeLevelCount }, (_, index) => index);
  const highStart = TONE_LEVEL_COUNT - edgeLevelCount;
  const highLevels = Array.from({ length: edgeLevelCount }, (_, index) => highStart + index);

  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = '#020305';
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const scanX = 260 + phase * 1400;
  const glow = context.createRadialGradient(scanX, 520, 40, scanX, 520, 780);
  glow.addColorStop(0, 'rgba(255,255,255,0.09)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawText(context, '8-bit Tone Loss Video Pattern', 72, 64, 34, 'rgba(248, 250, 252, 0.98)');
  drawText(context, 'Shadow and highlight patches should remain separately visible. If neighboring labels merge, that range is losing gradation.', 72, 104, 20, 'rgba(203, 213, 225, 0.82)');
  drawText(context, `Levels: ${lowLevels[0]}-${lowLevels.at(-1)} / ${highLevels[0]}-${highLevels.at(-1)} · RGB + CMY + W/K`, 72, 138, 19, 'rgba(125, 211, 252, 0.86)');

  drawSectionLabel(context, '極暗處 / SHADOW 8-bit code values', 72, 202, 820);
  drawSectionLabel(context, '高光處 / HIGHLIGHT 8-bit code values', 1028, 202, 820);

  drawPatchGrid(context, TONE_PATCH_ROWS, 72, 242, 820, 560, lowLevels, phase);
  drawPatchGrid(context, TONE_PATCH_ROWS, 1028, 242, 820, 560, highLevels, phase);

  drawText(context, 'continuous ramp reference', 72, 844, 18, 'rgba(203, 213, 225, 0.8)');
  drawText(context, 'discrete labels above are the pass/fail target', 1028, 844, 18, 'rgba(203, 213, 225, 0.8)');

  const rampHeight = 30;
  TONE_PATCH_ROWS.forEach((row, index) => {
    const rampY = 872 + index * (rampHeight + 8);
    drawText(context, row.shortLabel, 72, rampY + rampHeight * 0.5, 18, 'rgba(226, 232, 240, 0.9)');
    drawContinuousBand(context, row, 122, rampY, 770, rampHeight, 0, 255);
    drawContinuousBand(context, row, 1028, rampY, 820, rampHeight, highStart, 255);
  });

  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  context.lineWidth = 2;
  context.setLineDash([12, 10]);
  context.beginPath();
  context.moveTo(scanX, 178);
  context.lineTo(scanX, 1034);
  context.stroke();
  context.restore();
}

export function ToneLossTestPage() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const startedAtRef = React.useRef<number>(performance.now());
  const pausedAtRef = React.useRef<number>(0);
  const [playing, setPlaying] = React.useState(true);
  const [videoPreviewEnabled, setVideoPreviewEnabled] = React.useState(false);
  const [streamExpanded, setStreamExpanded] = React.useState(false);
  const [videoStreamStatus, setVideoStreamStatus] = React.useState<'idle' | 'running' | 'unavailable' | 'error'>('idle');
  const [edgeLevelCount, setEdgeLevelCount] = React.useState(DEFAULT_EDGE_LEVEL_COUNT);
  const [speed, setSpeed] = React.useState(0.24);

  const renderFrame = React.useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const targetWidth = Math.round(displayWidth * pixelRatio);
    const targetHeight = Math.round(displayHeight * pixelRatio);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    context.save();
    context.scale(targetWidth / CANVAS_WIDTH, targetHeight / CANVAS_HEIGHT);
    drawToneLossFrame(context, timestamp - startedAtRef.current, { edgeLevelCount, speed });
    context.restore();
  }, [edgeLevelCount, speed]);

  React.useEffect(() => {
    const tick = (timestamp: number) => {
      renderFrame(playing ? timestamp : pausedAtRef.current);
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playing, renderFrame]);

  React.useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!videoPreviewEnabled) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) {
        video.srcObject = null;
      }
      setVideoStreamStatus('idle');
      setStreamExpanded(false);
      return;
    }

    if (!canvas || typeof canvas.captureStream !== 'function') {
      setVideoStreamStatus('unavailable');
      return;
    }

    try {
      const stream = canvas.captureStream(60);
      streamRef.current = stream;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => setVideoStreamStatus('error'));
      }
      setVideoStreamStatus('running');
    } catch {
      setVideoStreamStatus('error');
    }

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) {
        video.srcObject = null;
      }
    };
  }, [videoPreviewEnabled]);

  const togglePlaying = () => {
    if (playing) {
      pausedAtRef.current = performance.now();
      setPlaying(false);
      return;
    }

    startedAtRef.current += performance.now() - pausedAtRef.current;
    setPlaying(true);
  };

  const resetPlayback = () => {
    startedAtRef.current = performance.now();
    pausedAtRef.current = startedAtRef.current;
    renderFrame(startedAtRef.current);
  };

  return (
    <main className="min-h-screen bg-[#020305] text-zinc-100">
      <div className="flex min-h-screen flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0b0f14] px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-cyan-200">
              <Gauge size={15} />
              Tone loss checker
            </div>
            <h1 className="mt-1 text-[20px] font-semibold tracking-normal text-zinc-50">
              階調損失檢查影片
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlaying}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.06] px-3 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.1]"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? '暫停' : '播放'}
            </button>
            <button
              type="button"
              onClick={resetPlayback}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06]"
            >
              <RotateCcw size={14} />
              重播
            </button>
            <button
              type="button"
              onClick={() => setVideoPreviewEnabled((value) => !value)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06]"
              aria-pressed={videoPreviewEnabled}
            >
              <Gauge size={14} />
              {videoPreviewEnabled ? '關閉 video stream' : '建立 video stream'}
            </button>
            <button
              type="button"
              onClick={() => setStreamExpanded((value) => !value)}
              disabled={!videoPreviewEnabled}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
              aria-pressed={streamExpanded}
            >
              {streamExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {streamExpanded ? '縮小 stream' : '放大 stream'}
            </button>
            <label className="grid min-w-[150px] gap-1 text-[10px] font-semibold uppercase tracking-normal text-zinc-400">
              edge levels
              <input
                type="range"
                min={8}
                max={32}
                step={4}
                value={edgeLevelCount}
                onChange={(event) => setEdgeLevelCount(Number(event.target.value))}
                className="gsdf-range"
              />
            </label>
            <label className="grid min-w-[150px] gap-1 text-[10px] font-semibold uppercase tracking-normal text-zinc-400">
              speed
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
                className="gsdf-range"
              />
            </label>
            <div className="rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-zinc-300">
              {edgeLevelCount} 階 · {speed.toFixed(2)}x · video {videoStreamStatus}
            </div>
          </div>
        </header>

        <section className="min-h-0 flex-1 p-3">
          <div
            className={`grid h-full gap-3 ${
              videoPreviewEnabled
                ? streamExpanded
                  ? 'lg:grid-cols-[minmax(280px,0.34fr)_minmax(0,1fr)]'
                  : 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.38fr)]'
                : ''
            }`}
            data-stream-expanded={streamExpanded ? 'true' : 'false'}
          >
            <canvas
              ref={canvasRef}
              aria-label="8-bit tone loss video pattern with shadow, highlight, RGB, CMY, black and white patches"
              className={`w-full rounded-md border border-white/10 bg-black shadow-2xl ${
                videoPreviewEnabled && streamExpanded ? 'h-auto min-h-[220px] self-start lg:aspect-video' : 'h-full min-h-[620px]'
              }`}
            />
            {videoPreviewEnabled && (
              <aside className={`flex min-h-[320px] flex-col gap-3 rounded-md border border-white/10 bg-[#080b0f] p-3 ${streamExpanded ? 'lg:min-h-[620px]' : ''}`}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-normal text-cyan-200">
                    {streamExpanded ? 'expanded captureStream video target' : 'captureStream video target'}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-zinc-400">
                    這個 video 的來源是左側 canvas.captureStream(60)，可用來測試擴充是否能辨識並套用到真正的 HTML video element。
                  </p>
                </div>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className={`${streamExpanded ? 'min-h-[560px] flex-1' : 'aspect-video'} w-full rounded-md border border-white/10 bg-black object-contain`}
                  aria-label="HTML video element fed by canvas captureStream"
                />
              </aside>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
