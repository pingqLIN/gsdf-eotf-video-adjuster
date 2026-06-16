import React from 'react';
import { Camera, Clipboard, Gauge, Pause, Play, RotateCcw, Target, Video } from 'lucide-react';
import { createCameraCapabilitySnapshot, requestCameraStream, stopCameraStream } from '../diagnostics/cameraProbe';
import { analyzeLuminanceFrame, estimateLuminance } from '../diagnostics/luminanceEstimator';
import type { CameraCapabilitySnapshot, LuminanceEstimate, LuminanceFrameSample, LuminanceReference } from '../diagnostics/measurementTypes';
import type { AppSettings } from '../types';
import type { Messages } from '../i18n';

interface DiagnosticCameraProbeProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  messages: Messages;
}

function formatMetric(value: number | undefined, digits = 3): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '--';
  }

  return value.toFixed(digits);
}

function readExposure(settings: Record<string, unknown>) {
  const exposure = {
    iso: typeof settings.iso === 'number' ? settings.iso : undefined,
    exposureTime: typeof settings.exposureTime === 'number' ? settings.exposureTime : undefined,
    exposureCompensation: typeof settings.exposureCompensation === 'number' ? settings.exposureCompensation : undefined,
    exposureMode: typeof settings.exposureMode === 'string' ? settings.exposureMode : undefined,
  };

  return Object.values(exposure).some((value) => value !== undefined) ? exposure : undefined;
}

function hasExposureMetadata(snapshot: CameraCapabilitySnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }

  return ['iso', 'exposureTime', 'exposureCompensation', 'exposureMode'].some((key) => key in snapshot.settings);
}

export function DiagnosticCameraProbe({ settings, setSettings, messages }: DiagnosticCameraProbeProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const latestSampleRef = React.useRef<LuminanceFrameSample | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [capabilitySnapshot, setCapabilitySnapshot] = React.useState<CameraCapabilitySnapshot | null>(null);
  const [sample, setSample] = React.useState<LuminanceFrameSample | null>(null);
  const [referenceNits, setReferenceNits] = React.useState(100);
  const [reference, setReference] = React.useState<LuminanceReference | null>(null);
  const [copied, setCopied] = React.useState(false);

  const estimate = React.useMemo<LuminanceEstimate>(() => estimateLuminance(sample, reference), [reference, sample]);
  const exposureAvailable = hasExposureMetadata(capabilitySnapshot);
  const cameraLabel = typeof capabilitySnapshot?.settings.deviceId === 'string'
    ? capabilitySnapshot.settings.deviceId.slice(0, 12)
    : messages.cameraProbe.deviceUnknown;

  const sampleFrame = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });

    if (!video || !canvas || !context || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const nextSample = analyzeLuminanceFrame(imageData, {
      previousSample: latestSampleRef.current,
      exposure: capabilitySnapshot ? readExposure(capabilitySnapshot.settings) : undefined,
    });

    latestSampleRef.current = nextSample;
    setSample(nextSample);

    return nextSample;
  }, [capabilitySnapshot]);

  const stopProbe = React.useCallback(() => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    latestSampleRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  }, []);

  const startProbe = async () => {
    setStatus('starting');
    setError(null);

    try {
      const stream = await requestCameraStream();
      const [track] = stream.getVideoTracks();
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (track) {
        setCapabilitySnapshot(await createCameraCapabilitySnapshot(track));
      }
      setStatus('running');
    } catch (startError) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      setError(startError instanceof Error ? startError.message : messages.cameraProbe.unknownError);
      setStatus('error');
    }
  };

  React.useEffect(() => {
    if (status !== 'running') {
      return;
    }

    const timer = window.setInterval(sampleFrame, 500);
    sampleFrame();

    return () => {
      window.clearInterval(timer);
    };
  }, [sampleFrame, status]);

  React.useEffect(() => stopProbe, [stopProbe]);

  const captureReference = () => {
    const nextSample = sampleFrame() ?? sample;
    if (!nextSample) {
      return;
    }

    setReference({
      referenceNits: referenceNits,
      referenceSignal: Math.max(0.000001, nextSample.meanY),
    });
  };

  const applySuggestedLmax = () => {
    if (!estimate.suggestedLmax) {
      return;
    }

    setSettings((current) => ({
      ...current,
      lmax: estimate.suggestedLmax ?? current.lmax,
    }));
  };

  const resetRun = () => {
    setReference(null);
    setSample(null);
    latestSampleRef.current = null;
    setCopied(false);
  };

  const copyDiagnostics = async () => {
    const payload = JSON.stringify({
      capabilitySnapshot,
      sample,
      estimate,
      currentLmax: settings.lmax,
    }, null, 2);

    try {
      await navigator.clipboard?.writeText(payload);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="gsdf-diagnostic-placeholder gsdf-camera-probe flex min-h-[328px] flex-col gap-4 rounded-md border border-white/10 bg-[#080b0f] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="gsdf-control-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-zinc-200">
            <Camera size={16} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
              {messages.cameraProbe.title}
            </div>
            <p className="mt-1 max-w-[560px] text-[12px] leading-5 text-zinc-400">
              {messages.cameraProbe.body}
            </p>
          </div>
        </div>
        <span className="gsdf-mode-pill inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[10px] font-semibold text-zinc-300">
          <Gauge size={13} />
          {status === 'running' ? messages.cameraProbe.statusRunning : status === 'starting' ? messages.cameraProbe.statusStarting : messages.cameraProbe.statusIdle}
        </span>
      </div>

      <div className="grid gap-3 min-[760px]:grid-cols-[minmax(0,1fr)_minmax(230px,0.78fr)]">
        <div className="gsdf-camera-preview relative min-h-[220px] overflow-hidden rounded-md border border-white/10 bg-black">
          <video ref={videoRef} muted playsInline className="h-full min-h-[220px] w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-[30%] border border-white/70 shadow-[0_0_0_999px_rgba(0,0,0,0.32)]" />
          {status !== 'running' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/68 text-center text-[12px] font-semibold text-zinc-300">
              {messages.cameraProbe.previewIdle}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-zinc-200">
              <Video size={14} />
              {messages.cameraProbe.probeStatus}
            </div>
            <div className="grid gap-1.5 font-mono text-[10px] text-zinc-500">
              <div>{messages.cameraProbe.cameraOnly}</div>
              <div>{messages.cameraProbe.device}: {cameraLabel}</div>
              <div>{exposureAvailable ? messages.cameraProbe.exposureAvailable : messages.cameraProbe.exposureUnavailable}</div>
              <div>{messages.cameraProbe.stability}: {formatMetric(sample?.stabilityScore, 2)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={status === 'running' || status === 'starting' ? stopProbe : startProbe}
              className="gsdf-text-button flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              {status === 'running' || status === 'starting' ? <Pause size={13} /> : <Play size={13} />}
              {status === 'running' || status === 'starting' ? messages.cameraProbe.stop : messages.cameraProbe.start}
            </button>
            <button
              type="button"
              onClick={() => sampleFrame()}
              disabled={status !== 'running'}
              className="gsdf-text-button flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-45"
            >
              <Target size={13} />
              {messages.cameraProbe.capture}
            </button>
            <button
              type="button"
              onClick={resetRun}
              className="gsdf-text-button flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <RotateCcw size={13} />
              {messages.cameraProbe.reset}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 min-[760px]:grid-cols-2">
        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-[11px] font-semibold text-zinc-200">{messages.cameraProbe.measurement}</div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-zinc-500">
            <div>{messages.cameraProbe.meanY}: {formatMetric(sample?.meanY)}</div>
            <div>{messages.cameraProbe.medianY}: {formatMetric(sample?.medianY)}</div>
            <div>{messages.cameraProbe.p05Y}: {formatMetric(sample?.p05Y)}</div>
            <div>{messages.cameraProbe.p95Y}: {formatMetric(sample?.p95Y)}</div>
            <div>{messages.cameraProbe.clipLow}: {formatMetric(sample?.clipLowRatio, 2)}</div>
            <div>{messages.cameraProbe.clipHigh}: {formatMetric(sample?.clipHighRatio, 2)}</div>
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-2 text-[11px] font-semibold text-zinc-200">{messages.cameraProbe.result}</div>
          <div className="grid gap-2">
            <label className="grid grid-cols-[1fr_82px] items-center gap-2 text-[11px] font-semibold text-zinc-300">
              <span>{messages.cameraProbe.referenceNits}</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={referenceNits}
                onChange={(event) => setReferenceNits(Number(event.target.value))}
                className="h-8 rounded-md border border-white/10 bg-[#080b0f] px-2 text-right font-mono text-[11px] text-zinc-200"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={captureReference}
                disabled={!sample && status !== 'running'}
                className="gsdf-text-button flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-45"
              >
                {messages.cameraProbe.captureReference}
              </button>
              <button
                type="button"
                onClick={applySuggestedLmax}
                disabled={!estimate.suggestedLmax}
                className="gsdf-text-button flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-45"
              >
                {messages.cameraProbe.applyLmax}
              </button>
            </div>
            <div className="font-mono text-[10px] leading-5 text-zinc-500">
              <div>{messages.cameraProbe.relativeIndex}: {formatMetric(estimate.relativeIndex)}</div>
              <div>{messages.cameraProbe.estimatedNits}: {formatMetric(estimate.estimatedNits, 1)}</div>
              <div>{messages.cameraProbe.suggestedLmax}: {formatMetric(estimate.suggestedLmax, 1)}</div>
              <div>{messages.cameraProbe.confidence}: {estimate.confidence}</div>
            </div>
          </div>
        </div>
      </div>

      {(error || estimate.warnings.length > 0 || capabilitySnapshot?.warnings.length) && (
        <div className="rounded-md border border-amber-300/35 bg-amber-300/10 p-3 text-[11px] leading-5 text-amber-100">
          {[error, ...(capabilitySnapshot?.warnings ?? []), ...estimate.warnings].filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <div className="font-mono text-[10px] text-zinc-500">
          {messages.cameraProbe.roughMeterBoundary}
        </div>
        <button
          type="button"
          onClick={copyDiagnostics}
          className="gsdf-text-button flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
        >
          <Clipboard size={13} />
          {copied ? messages.cameraProbe.copied : messages.cameraProbe.copyDiagnostics}
        </button>
      </div>
    </section>
  );
}
