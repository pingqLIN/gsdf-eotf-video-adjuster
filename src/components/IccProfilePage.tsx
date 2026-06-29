import React from 'react';
import {
  buildToneCurveSnapshot,
  type AppSettings,
  type ToneCurveSnapshot,
} from '../types';
import {
  DISPLAY_DEVICE_PRESETS,
  type DisplayPresetId,
} from '../color/displayPresets';
import {
  buildEizoGammaLutCsv,
  buildEizoGammaLutFileName,
  validateEizoGammaLutCsv,
} from '../eizo/exportEizoLutCsv';

interface IccProfilePageProps {
  settings: AppSettings;
}

type ExportKind = 'eizo-gamma-lut-csv' | 'json-sidecar';

const PREVIEW_SAMPLE_INDEXES = [0, 1, 16, 64, 128, 192, 255];

function formatNumber(value: number, digits = 6): string {
  return value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

export function downloadBlob(bytes: Uint8Array | string, fileName: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildExportMetadata(
  snapshot: ToneCurveSnapshot,
  kind: ExportKind,
): Record<string, unknown> {
  return {
    generator: 'LumaLift',
    kind,
    profileIntent: kind === 'eizo-gamma-lut-csv' ? 'eizo-target-eotf' : snapshot.metadata.profileIntent,
    transferFormula: snapshot.metadata.transferFormula,
    displayGamut: snapshot.metadata.displayGamut,
    displayPreset: snapshot.metadata.displayPresetId,
    targetLuminanceNits: snapshot.metadata.targetLuminanceNits,
    effectiveBlackNits: snapshot.metadata.displayBlackNits,
    displayGamma: snapshot.metadata.displayGamma,
    gammaTarget: snapshot.metadata.gammaTarget,
    strength: snapshot.metadata.strength,
    blackPoint: snapshot.metadata.blackPoint,
    whitePoint: snapshot.metadata.whitePoint,
    eizoSamples: snapshot.metadata.tableSize,
    createdAt: new Date().toISOString(),
  };
}

function CurvePreviewTable({ snapshot }: { snapshot: ToneCurveSnapshot }) {
  return (
    <table className="w-full border-collapse text-left text-[11px] text-zinc-200">
      <thead className="text-[10px] uppercase tracking-[0.08em] text-zinc-500">
        <tr className="border-b border-white/10">
          <th className="py-2 pr-3 font-semibold">Code</th>
          <th className="py-2 pr-3 font-semibold">E(c)</th>
          <th className="py-2 pr-3 font-semibold">M(c)</th>
          <th className="py-2 font-semibold">D(d)</th>
        </tr>
      </thead>
      <tbody>
        {PREVIEW_SAMPLE_INDEXES.map((index) => (
          <tr key={index} className="border-b border-white/[0.04] last:border-0">
            <td className="py-2 pr-3 font-mono text-zinc-400">{index}</td>
            <td className="py-2 pr-3 font-mono">{formatNumber(snapshot.targetEotfNorm[index] ?? 0)}</td>
            <td className="py-2 pr-3 font-mono">{formatNumber(snapshot.codeRemapNorm[index] ?? 0)}</td>
            <td className="py-2 font-mono">{formatNumber(snapshot.iccTrcNorm[index] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function IccProfilePage({ settings }: IccProfilePageProps) {
  const [displayPresetId, setDisplayPresetId] = React.useState<DisplayPresetId>('ips-1000');
  const snapshot = React.useMemo(
    () => buildToneCurveSnapshot(settings, { tableSize: 256, displayPreset: displayPresetId }),
    [displayPresetId, settings],
  );
  const eizoCsv = React.useMemo(() => buildEizoGammaLutCsv(snapshot), [snapshot]);
  const eizoErrors = React.useMemo(() => validateEizoGammaLutCsv(eizoCsv), [eizoCsv]);
  const metadata = React.useMemo(
    () => buildExportMetadata(snapshot, 'json-sidecar'),
    [snapshot],
  );
  const eizoFileName = buildEizoGammaLutFileName(snapshot);
  const jsonFileName = eizoFileName.replace(/\.csv$/i, '.json');

  const handleExportEizoCsv = () => {
    downloadBlob(eizoCsv, eizoFileName, 'text/csv;charset=utf-8');
  };

  const handleExportMetadata = () => {
    downloadBlob(`${JSON.stringify(metadata, null, 2)}\n`, jsonFileName, 'application/json;charset=utf-8');
  };

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-5 py-6 md:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="flex flex-col gap-4">
          <div className="border-b border-white/10 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">LumaLift export</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white">ICC / EIZO profile output</h1>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Display template</span>
            <select
              value={displayPresetId}
              onChange={(event) => setDisplayPresetId(event.target.value as DisplayPresetId)}
              className="h-10 rounded border border-white/15 bg-black px-3 text-sm text-zinc-100 outline-none focus:border-sky-300"
            >
              {Object.values(DISPLAY_DEVICE_PRESETS).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-white/10 py-4 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Formula</dt>
              <dd className="mt-1 font-mono text-sky-200">{settings.transferFormula.toUpperCase()}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Gamut</dt>
              <dd className="mt-1 font-mono text-sky-200">{settings.displayGamut}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Luminance</dt>
              <dd className="mt-1 font-mono">{settings.lmax} nits</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Black</dt>
              <dd className="mt-1 font-mono">{formatNumber(snapshot.metadata.displayBlackNits, 4)} nits</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Display gamma</dt>
              <dd className="mt-1 font-mono">{settings.displayGamma}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Strength</dt>
              <dd className="mt-1 font-mono">{settings.strength}%</dd>
            </div>
          </dl>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={handleExportEizoCsv}
              disabled={eizoErrors.length > 0}
              className="h-10 rounded bg-sky-300 px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Export EIZO CSV
            </button>
            <button
              type="button"
              onClick={handleExportMetadata}
              className="h-10 rounded border border-white/15 px-4 text-sm font-semibold text-zinc-100 hover:border-sky-300"
            >
              Export JSON sidecar
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="h-10 rounded border border-white/10 px-4 text-sm font-semibold text-zinc-500"
            >
              Install ICC profile
            </button>
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 border-b border-white/10 pb-4 md:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">EIZO rows</p>
              <p className="mt-1 font-mono text-lg text-white">{snapshot.metadata.tableSize}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">CSV status</p>
              <p className="mt-1 font-mono text-lg text-emerald-300">{eizoErrors.length === 0 ? 'valid' : 'blocked'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Output</p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-300" title={eizoFileName}>{eizoFileName}</p>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded border border-white/10">
            <CurvePreviewTable snapshot={snapshot} />
          </div>

          {eizoErrors.length > 0 && (
            <ul className="grid gap-2 text-sm text-red-300">
              {eizoErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
