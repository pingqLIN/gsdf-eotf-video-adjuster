import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';

const moduleCache = new Map();

async function loadTsModule(path) {
  if (!moduleCache.has(path)) {
    moduleCache.set(path, esbuildBuild({
      entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      logLevel: 'silent',
    }).then((result) => {
      const source = result.outputFiles[0].text;
      return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    }));
  }

  return moduleCache.get(path);
}

function parseCsvValues(csv) {
  return csv.trim().split(/\r?\n/).map(Number);
}

function assertEizoCsvShape(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const values = parseCsvValues(csv);

  assert.equal(lines.length, 256);
  assert.ok(lines.every((line) => !line.includes(',')), 'EIZO CSV must not contain commas');
  assert.ok(values.every((value) => Number.isFinite(value) && value > 0), 'all EIZO values must be finite and > 0');
  assert.equal(values.at(-1), Math.max(...values), 'last EIZO row must be the maximum');

  for (let index = 1; index < values.length; index += 1) {
    assert.ok(values[index] >= values[index - 1], `line ${index + 1} should be monotonic`);
  }
}

test('exports a valid 256-line EIZO Gamma LUT CSV from target EOTF', async () => {
  const { buildToneCurveSnapshot } = await loadTsModule('../src/color/buildToneCurveSnapshot.ts');
  const {
    buildEizoGammaLutCsv,
    buildEizoGammaLutFileName,
    validateEizoGammaLutCsv,
  } = await loadTsModule('../src/eizo/exportEizoLutCsv.ts');
  const snapshot = buildToneCurveSnapshot({
    lmax: 160,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    transferFormula: 'csdf',
    displayGamut: 'display-p3',
    strength: 80,
  }, {
    tableSize: 256,
    displayPreset: 'oled-zero-black',
  });
  const csv = buildEizoGammaLutCsv(snapshot);

  assertEizoCsvShape(csv);
  assert.deepEqual(validateEizoGammaLutCsv(csv), []);
  assert.equal(parseCsvValues(csv)[0], 0.000001);
  assert.match(buildEizoGammaLutFileName(snapshot), /^LumaLift-CSDF_EIZO_DisplayP3_oledzeroblack_L160_B0\.0005_S80\.csv$/);
});

test('EIZO exporter uses targetEotfNorm and not iccTrcNorm', async () => {
  const { buildEizoGammaLutCsv, validateEizoGammaLutCsv } = await loadTsModule('../src/eizo/exportEizoLutCsv.ts');
  const targetEotfNorm = Array.from({ length: 256 }, (_, index) => index / 255);
  const fakeSnapshot = {
    targetEotfNorm,
    iccTrcNorm: targetEotfNorm.map((value) => 1 - value),
  };
  const csv = buildEizoGammaLutCsv(fakeSnapshot, { precision: 6, minPositiveValue: 0.000001 });
  const values = parseCsvValues(csv);

  assert.deepEqual(validateEizoGammaLutCsv(csv), []);
  assert.equal(values[128], Number(targetEotfNorm[128].toFixed(6)));
  assert.notEqual(values[128], Number(fakeSnapshot.iccTrcNorm[128].toFixed(6)));
});

test('EIZO validator reports malformed line count, commas, zeros, and non-monotonic rows', async () => {
  const { validateEizoGammaLutCsv } = await loadTsModule('../src/eizo/exportEizoLutCsv.ts');
  const badCsv = ['0', '0.3', '0.2', '0.2,0.3'].join('\n');
  const errors = validateEizoGammaLutCsv(badCsv);

  assert.ok(errors.some((error) => /Expected 256 lines/.test(error)));
  assert.ok(errors.some((error) => /must not contain comma/.test(error)));
  assert.ok(errors.some((error) => /must be > 0/.test(error)));
  assert.ok(errors.some((error) => /not monotonic/.test(error)));
});

test('EIZO exporter rejects snapshots that are not 256 samples', async () => {
  const { buildEizoGammaLutCsv } = await loadTsModule('../src/eizo/exportEizoLutCsv.ts');

  assert.throws(
    () => buildEizoGammaLutCsv({ targetEotfNorm: [0, 1] }),
    /requires exactly 256 samples/,
  );
});
