import React from 'react';
import { Camera, Clipboard, Pause, Play, RefreshCcw, ShieldAlert } from 'lucide-react';
import { createCameraCapabilitySnapshot, requestCameraStream, stopCameraStream } from '../diagnostics/cameraProbe';
import type { CameraCapabilitySnapshot } from '../diagnostics/measurementTypes';

type CameraStatus = 'idle' | 'starting' | 'running' | 'error';

const EXPOSURE_FIELDS = [
  'iso',
  'exposureTime',
  'exposureCompensation',
  'exposureMode',
] as const;

const CAMERA_CONTROL_FIELDS = [
  'focusMode',
  'whiteBalanceMode',
  'brightness',
  'contrast',
  'colorTemperature',
] as const;

const DISPLAY_FIELDS = [...EXPOSURE_FIELDS, ...CAMERA_CONTROL_FIELDS] as const;

function formatDiagnosticValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '--';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toPrecision(6);
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readFirstAvailable(snapshot: CameraCapabilitySnapshot | null, field: string): { value: unknown; source: string } {
  if (!snapshot) {
    return { value: undefined, source: '--' };
  }

  const sources: Array<[string, Record<string, unknown> | undefined]> = [
    ['settings', snapshot.settings],
    ['photoSettings', snapshot.photoSettings],
    ['capabilities', snapshot.capabilities],
    ['photoCapabilities', snapshot.photoCapabilities],
  ];

  for (const [source, values] of sources) {
    if (values && field in values) {
      return { value: values[field], source };
    }
  }

  return { value: undefined, source: '--' };
}

export function CameraExposureTestPage() {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [status, setStatus] = React.useState<CameraStatus>('idle');
  const [snapshot, setSnapshot] = React.useState<CameraCapabilitySnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const stopCamera = React.useCallback((updateStatus = true) => {
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (updateStatus) {
      setStatus('idle');
    }
  }, []);

  React.useEffect(() => () => stopCamera(false), [stopCamera]);

  const startCamera = async () => {
    setStatus('starting');
    setError(null);
    setCopied(false);

    try {
      const stream = await requestCameraStream({ width: 1280, height: 720, facingMode: 'environment' });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const [track] = stream.getVideoTracks();
      if (!track) {
        throw new Error('No video track returned by getUserMedia');
      }

      setSnapshot(await createCameraCapabilitySnapshot(track));
      setStatus('running');
    } catch (startError) {
      stopCameraStream(streamRef.current);
      streamRef.current = null;
      setSnapshot(null);
      setError(startError instanceof Error ? startError.message : 'Unknown camera error');
      setStatus('error');
    }
  };

  const refreshSnapshot = async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) {
      return;
    }

    setSnapshot(await createCameraCapabilitySnapshot(track));
  };

  const copySnapshot = async () => {
    const payload = JSON.stringify({
      capturedAt: new Date().toISOString(),
      secureContext: window.isSecureContext,
      snapshot,
      error,
    }, null, 2);

    try {
      await navigator.clipboard?.writeText(payload);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const hasExposureField = EXPOSURE_FIELDS.some((field) => readFirstAvailable(snapshot, field).value !== undefined);
  const hasCameraControlField = CAMERA_CONTROL_FIELDS.some((field) => readFirstAvailable(snapshot, field).value !== undefined);

  return (
    <main className="min-h-screen bg-[#07090c] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              <Camera size={15} />
              Camera exposure test
            </div>
            <h1 className="text-[22px] font-semibold tracking-normal text-zinc-50 sm:text-[28px]">
              手機相機曝光參數測試頁
            </h1>
            <p className="max-w-2xl text-[13px] leading-6 text-zinc-400">
              這個頁面只啟動相機並嘗試讀取瀏覽器暴露的 ISO、快門、曝光補償與模式。待測色塊仍應顯示在電腦端 Chrome/擴充程式畫面上。
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-[11px] text-zinc-400">
            {status}
          </div>
        </header>

        {!window.isSecureContext && (
          <div className="flex items-start gap-3 rounded-md border border-amber-300/35 bg-amber-300/10 p-3 text-[12px] leading-5 text-amber-100">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <span>相機 API 通常需要 HTTPS 或 localhost secure context；手機用區網 HTTP 開啟時可能無法啟動相機。</span>
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="overflow-hidden rounded-md border border-white/10 bg-black">
            <video ref={videoRef} muted playsInline className="aspect-video min-h-[240px] w-full bg-black object-cover" />
            <div className="flex flex-wrap gap-2 border-t border-white/10 bg-[#0d1117] p-3">
              <button
                type="button"
                onClick={status === 'running' || status === 'starting' ? () => stopCamera() : startCamera}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 text-[12px] font-semibold text-zinc-100 transition-colors hover:bg-white/[0.1]"
              >
                {status === 'running' || status === 'starting' ? <Pause size={14} /> : <Play size={14} />}
                {status === 'running' || status === 'starting' ? '停止相機' : '啟動相機'}
              </button>
              <button
                type="button"
                onClick={refreshSnapshot}
                disabled={status !== 'running'}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06] disabled:opacity-45"
              >
                <RefreshCcw size={14} />
                重新讀取參數
              </button>
              <button
                type="button"
                onClick={copySnapshot}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/[0.06]"
              >
                <Clipboard size={14} />
                {copied ? '已複製' : '複製 JSON'}
              </button>
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-zinc-100">曝光相關欄位</h2>
              <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${hasExposureField ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-100'}`}>
                {hasExposureField ? 'exposure metadata found' : 'exposure unavailable'}
              </span>
            </div>
            <div className="grid gap-2">
              {DISPLAY_FIELDS.map((field) => {
                const entry = readFirstAvailable(snapshot, field);
                return (
                  <div key={field} className="grid grid-cols-[126px_1fr_92px] gap-2 rounded-md border border-white/8 bg-black/20 px-3 py-2 font-mono text-[10px] text-zinc-400">
                    <span className="text-zinc-300">{field}</span>
                    <span className="break-all text-zinc-100">{formatDiagnosticValue(entry.value)}</span>
                    <span className="text-right text-zinc-500">{entry.source}</span>
                  </div>
                );
              })}
            </div>
            {error && (
              <div className="mt-3 rounded-md border border-red-300/30 bg-red-400/10 p-3 text-[12px] leading-5 text-red-100">
                {error}
              </div>
            )}
            {snapshot && !hasExposureField && (
              <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-[12px] leading-5 text-amber-100">
                目前瀏覽器沒有暴露 ISO、快門或曝光補償；{hasCameraControlField ? '只偵測到白平衡或其他 camera control metadata。' : '尚未偵測到可用 camera control metadata。'}這台手機需要走 histogram / iPhone reference ratio 備案。
              </div>
            )}
            {snapshot?.warnings.length ? (
              <div className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-[12px] leading-5 text-amber-100">
                {snapshot.warnings.join(' · ')}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-zinc-100">track.getSettings()</h2>
            <pre className="max-h-[320px] overflow-auto rounded-md bg-black/40 p-3 text-[10px] leading-5 text-zinc-300">{JSON.stringify(snapshot?.settings ?? {}, null, 2)}</pre>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-zinc-100">track.getCapabilities() / ImageCapture</h2>
            <pre className="max-h-[320px] overflow-auto rounded-md bg-black/40 p-3 text-[10px] leading-5 text-zinc-300">{JSON.stringify({
              capabilities: snapshot?.capabilities ?? {},
              photoCapabilities: snapshot?.photoCapabilities ?? {},
              photoSettings: snapshot?.photoSettings ?? {},
            }, null, 2)}</pre>
          </div>
        </section>
      </div>
    </main>
  );
}
