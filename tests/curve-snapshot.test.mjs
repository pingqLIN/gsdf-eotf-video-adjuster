import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build as esbuildBuild } from 'esbuild';

const contentSource = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');
let toneModulePromise;

async function loadToneModule() {
  toneModulePromise ??= esbuildBuild({
    entryPoints: [fileURLToPath(new URL('../src/color/buildToneCurveSnapshot.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  }).then((result) => {
    const source = result.outputFiles[0].text;
    const encoded = Buffer.from(source).toString('base64');
    return import(`data:text/javascript;base64,${encoded}`);
  });

  return toneModulePromise;
}

function createContentContext() {
  const document = {
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return {
        contentWindow: {},
        dataset: {},
        style: {},
        setAttribute() {},
        append() {},
        remove() {},
        querySelectorAll() {
          return [];
        },
      };
    },
    createElementNS() {
      return {
        style: {},
        setAttribute() {},
        appendChild() {},
        remove() {},
      };
    },
    getElementById() {
      return null;
    },
  };
  const sandboxWindow = {
    __GSDF_EOTF_TEST__: true,
    innerWidth: 1280,
    innerHeight: 720,
    scrollX: 0,
    scrollY: 0,
    location: {
      hostname: 'example.test',
      pathname: '/',
    },
    document,
    addEventListener() {},
    getComputedStyle() {
      return { display: 'block', visibility: 'visible', opacity: '1' };
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
  };
  sandboxWindow.window = sandboxWindow;
  sandboxWindow.globalThis = sandboxWindow;

  return vm.createContext({
    console,
    window: sandboxWindow,
    globalThis: sandboxWindow,
    document,
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://test/${path}`,
        onMessage: { addListener() {} },
      },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: sandboxWindow.setInterval.bind(sandboxWindow),
    clearInterval: sandboxWindow.clearInterval.bind(sandboxWindow),
    setTimeout,
    clearTimeout,
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    cancelAnimationFrame() {},
  });
}

function loadContentHooks() {
  const context = createContentContext();
  vm.runInContext(contentSource, context, { filename: 'extension/content.js' });
  return context.window.__gsdfEotfTestHooks;
}

function assertMonotonicUnitTable(table, label, expectedLength = 256) {
  assert.equal(table.length, expectedLength, `${label} should have ${expectedLength} samples`);
  assert.equal(table[0], 0, `${label} should start at 0`);
  assert.equal(table.at(-1), 1, `${label} should end at 1`);

  for (let index = 0; index < table.length; index += 1) {
    assert.ok(table[index] >= 0 && table[index] <= 1, `${label}[${index}] should stay in [0,1]`);
    if (index > 0) {
      assert.ok(table[index] >= table[index - 1], `${label}[${index}] should be monotonic`);
    }
  }
}

function maxDifference(left, right) {
  const length = Math.min(left.length, right.length);
  let delta = 0;

  for (let index = 0; index < length; index += 1) {
    delta = Math.max(delta, Math.abs(left[index] - right[index]));
  }

  return delta;
}

test('tone curve snapshot exposes monotonic target, remap, inverse, and ICC TRC tables', async () => {
  const { buildToneCurveSnapshot } = await loadToneModule();
  const snapshot = buildToneCurveSnapshot({
    lmax: 180,
    gammaTarget: 2.2,
    displayGamma: 2.4,
    transferFormula: 'csdf',
    displayGamut: 'srgb',
    strength: 100,
  }, { tableSize: 256 });

  assertMonotonicUnitTable(snapshot.inputNorm, 'inputNorm');
  assertMonotonicUnitTable(snapshot.targetEotfNorm, 'targetEotfNorm');
  assertMonotonicUnitTable(snapshot.codeRemapNorm, 'codeRemapNorm');
  assertMonotonicUnitTable(snapshot.inverseCodeRemapNorm, 'inverseCodeRemapNorm');
  assertMonotonicUnitTable(snapshot.iccTrcNorm, 'iccTrcNorm');
  assert.equal(snapshot.metadata.tableSize, 256);
  assert.equal(snapshot.metadata.transferFormula, 'csdf');
  assert.equal(snapshot.metadata.profileIntent, 'compensation');
});

test('luminance, transfer formula, and display preset choices change the model curves', async () => {
  const { buildToneCurveSnapshot } = await loadToneModule();
  const base = {
    gammaTarget: 2.2,
    displayGamma: 2.2,
    displayGamut: 'srgb',
    strength: 100,
  };
  const dim = buildToneCurveSnapshot({ ...base, lmax: 80, transferFormula: 'gsdf' });
  const bright = buildToneCurveSnapshot({ ...base, lmax: 400, transferFormula: 'gsdf' });
  const gsdf = buildToneCurveSnapshot({ ...base, lmax: 140, transferFormula: 'gsdf' });
  const csdf = buildToneCurveSnapshot({ ...base, lmax: 140, transferFormula: 'csdf' });
  const lcd1000 = buildToneCurveSnapshot({ ...base, lmax: 120, transferFormula: 'gsdf' }, { displayPreset: 'lcd-1000' });
  const lcd2000 = buildToneCurveSnapshot({ ...base, lmax: 120, transferFormula: 'gsdf' }, { displayPreset: 'lcd-2000' });
  const oled = buildToneCurveSnapshot({ ...base, lmax: 120, transferFormula: 'gsdf' }, { displayPreset: 'oled-true-black' });

  assert.ok(maxDifference(dim.targetEotfNorm, bright.targetEotfNorm) > 0.00001);
  assert.ok(maxDifference(dim.codeRemapNorm, bright.codeRemapNorm) > 0.00001);
  assert.ok(maxDifference(gsdf.targetEotfNorm, csdf.targetEotfNorm) > 0.00001);
  assert.ok(maxDifference(gsdf.codeRemapNorm, csdf.codeRemapNorm) > 0.00001);
  assert.ok(maxDifference(lcd1000.targetEotfNorm, lcd2000.targetEotfNorm) > 0.000001);
  assert.ok(oled.metadata.displayBlackNits > 0, 'OLED preset should keep a positive mathematical black floor');
  assertMonotonicUnitTable(oled.targetEotfNorm, 'oled targetEotfNorm');
});

test('display gamut changes ICC compensation TRC instead of only changing metadata', async () => {
  const { buildToneCurveSnapshot } = await loadToneModule();
  const settings = {
    lmax: 160,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    transferFormula: 'csdf',
    strength: 100,
  };
  const srgb = buildToneCurveSnapshot({ ...settings, displayGamut: 'srgb' });
  const adobeRgb = buildToneCurveSnapshot({ ...settings, displayGamut: 'adobe-rgb' });

  assert.equal(maxDifference(srgb.codeRemapNorm, adobeRgb.codeRemapNorm), 0);
  assert.ok(maxDifference(srgb.iccTrcNorm, adobeRgb.iccTrcNorm) > 0.0001);
  assert.equal(srgb.metadata.sourceTransferKind, 'srgb');
  assert.equal(adobeRgb.metadata.sourceTransferKind, 'gamma');
});

test('content script mirror matches the bundled TypeScript tone curve snapshot', async () => {
  const { buildToneCurveSnapshot } = await loadToneModule();
  const hooks = loadContentHooks();
  const settings = {
    lmax: 210,
    gammaTarget: 2.4,
    displayGamma: 2.2,
    transferFormula: 'csdf',
    displayGamut: 'adobe-rgb',
    strength: 85,
    blackPoint: 4,
    whitePoint: 252,
  };
  const options = { tableSize: 64, displayPreset: 'lcd-2000' };
  const tsSnapshot = buildToneCurveSnapshot(settings, options);
  const contentSnapshot = hooks.buildToneCurveSnapshot(settings, options);

  for (const key of ['inputNorm', 'targetEotfNorm', 'codeRemapNorm', 'inverseCodeRemapNorm', 'iccTrcNorm']) {
    assert.equal(maxDifference(tsSnapshot[key], contentSnapshot[key]), 0, `${key} should match exactly`);
  }
  assert.deepEqual(
    Array.from(hooks.buildActiveTransferTableValues(settings, 64)),
    buildToneCurveSnapshot(settings, { tableSize: 64 }).codeRemapNorm,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(contentSnapshot.metadata)), tsSnapshot.metadata);
});
