import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';

const modulePromises = new Map();

async function loadBundledModule(path) {
  if (!modulePromises.has(path)) {
    modulePromises.set(path, esbuildBuild({
      entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      logLevel: 'silent',
    }).then((result) => {
      const encoded = Buffer.from(result.outputFiles[0].text).toString('base64');
      return import(`data:text/javascript;base64,${encoded}`);
    }));
  }

  return modulePromises.get(path);
}

function assertApproximately(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('standard gamma 2.2 hard 8-bit baseline retains all codes but has five sub-JND intervals', async () => {
  const optimization = await loadBundledModule('../src/color/hard8JndOptimization.ts');
  const deviceJndIndex = optimization.buildHard8DeviceJndIndex({
    blackNits: 0.1,
    whiteNits: 100,
    displayGamma: 2.2,
  });
  const baselineCodes = Array.from({ length: 256 }, (_, code) => code);
  const baseline = optimization.analyzeHard8DeviceCodeMapping(baselineCodes, deviceJndIndex);

  assert.equal(baseline.uniqueLevels, 256);
  assert.equal(baseline.mergedTransitions, 0);
  assert.equal(baseline.discernibleTransitions, 250);
  assert.equal(baseline.subJndTransitions, 5);
  assertApproximately(baseline.allJndStepSd, 0.5274293005069144);
});

test('standard gamma 2.2 identity is the exact all-input-step optimum', async () => {
  const optimization = await loadBundledModule('../src/color/hard8JndOptimization.ts');
  const deviceJndIndex = optimization.buildHard8DeviceJndIndex({
    blackNits: 0.1,
    whiteNits: 100,
    displayGamma: 2.2,
  });
  const identity = Array.from({ length: 256 }, (_, code) => code);
  const optimizedCodes = optimization.optimizeHard8AllStepMapping(deviceJndIndex, 256);

  assert.deepEqual(optimizedCodes, identity);
});

test('225-level constrained optimizer improves retained JND uniformity over current GSDF quantization', async () => {
  const [optimization, tone] = await Promise.all([
    loadBundledModule('../src/color/hard8JndOptimization.ts'),
    loadBundledModule('../src/color/buildToneCurveSnapshot.ts'),
  ]);
  const snapshot = tone.buildToneCurveSnapshot({
    lmax: 100,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    displayGamut: 'adobe-rgb',
    transferFormula: 'gsdf',
    strength: 100,
    blackPoint: 0,
    whitePoint: 256,
  }, {
    tableSize: 256,
    displayPreset: 'ips-1000',
    digits: 8,
  });
  const deviceJndIndex = optimization.buildHard8DeviceJndIndex({
    blackNits: snapshot.metadata.displayBlackNits,
    whiteNits: snapshot.metadata.displayWhiteNits,
    displayGamma: snapshot.metadata.displayGamma,
  });
  const gsdfCodes = snapshot.codeRemapNorm.map((value) => Math.round(value * 255));
  const current = optimization.analyzeHard8DeviceCodeMapping(gsdfCodes, deviceJndIndex);
  const selectedCodes = optimization.optimizeHard8JndDeviceLevels(
    deviceJndIndex,
    current.uniqueLevels,
  );
  const optimizedCodes = optimization.expandHard8JndLevelsToInputMapping(selectedCodes, 256);
  const optimized = optimization.analyzeHard8DeviceCodeMapping(optimizedCodes, deviceJndIndex);

  assert.equal(current.uniqueLevels, 225);
  assert.equal(current.mergedTransitions, 31);
  assert.equal(optimized.uniqueLevels, 225);
  assert.equal(optimized.mergedTransitions, 31);
  assert.ok(optimized.nonzeroJndStepSd < current.nonzeroJndStepSd);
  assert.ok(optimized.allJndStepSd < current.allJndStepSd);
  assertApproximately(current.nonzeroJndStepSd, 0.5005914234289706);
  assertApproximately(optimized.nonzeroJndStepSd, 0.435134320985834);
  assertApproximately(optimized.allJndStepSd, 0.7930744133566479);
});

test('allowing one merge lowers retained-step SD but not the all-input-step objective', async () => {
  const optimization = await loadBundledModule('../src/color/hard8JndOptimization.ts');
  const deviceJndIndex = optimization.buildHard8DeviceJndIndex({
    blackNits: 0.1,
    whiteNits: 100,
    displayGamma: 2.2,
  });
  const identity = optimization.analyzeHard8DeviceCodeMapping(
    Array.from({ length: 256 }, (_, code) => code),
    deviceJndIndex,
  );
  const selectedCodes = optimization.optimizeHard8JndDeviceLevels(deviceJndIndex, 255);
  const oneMerge = optimization.analyzeHard8DeviceCodeMapping(
    optimization.expandHard8JndLevelsToInputMapping(selectedCodes, 256),
    deviceJndIndex,
  );

  assert.equal(oneMerge.mergedTransitions, 1);
  assert.ok(oneMerge.nonzeroJndStepSd < identity.nonzeroJndStepSd);
  assert.ok(oneMerge.allJndStepSd > identity.allJndStepSd);
});

test('dynamic optimization model follows current luminance, gamma, route, and level budget', async () => {
  const optimization = await loadBundledModule('../src/color/hard8JndOptimization.ts');
  const baseSettings = {
    lmax: 100,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    displayGamut: 'adobe-rgb',
    transferFormula: 'gsdf',
    strength: 100,
    blackPoint: 0,
    whitePoint: 256,
  };
  const gsdf225 = optimization.buildHard8JndOptimizationModel(baseSettings, 225);
  const csdf210 = optimization.buildHard8JndOptimizationModel({
    ...baseSettings,
    lmax: 300,
    displayGamma: 2.4,
    transferFormula: 'csdf',
  }, 210);

  assert.equal(gsdf225.levelCount, 225);
  assert.equal(gsdf225.optimized.uniqueLevels, 225);
  assert.equal(gsdf225.optimized.mergedTransitions, 31);
  assert.equal(gsdf225.transferFormula, 'gsdf');
  assertApproximately(gsdf225.displayBlackNits, 0.1);
  assert.equal(csdf210.levelCount, 210);
  assert.equal(csdf210.optimized.uniqueLevels, 210);
  assert.equal(csdf210.optimized.mergedTransitions, 46);
  assert.equal(csdf210.transferFormula, 'csdf');
  assert.equal(csdf210.displayGamma, 2.4);
  assertApproximately(csdf210.displayBlackNits, 0.3);
  assert.notDeepEqual(csdf210.optimizedCodeRemapNorm, gsdf225.optimizedCodeRemapNorm);
});

test('active transfer applies and removes the persisted hard 8-bit optimization', async () => {
  const types = await loadBundledModule('../src/types.ts');
  const settings = {
    ...types.DEFAULT_APP_SETTINGS,
    enabled: true,
    transferFormula: 'gsdf',
    displayGamut: 'adobe-rgb',
    hard8JndLevelCount: 225,
  };
  const original = types.buildActiveTransferTableValues({
    ...settings,
    hard8JndOptimizationEnabled: false,
  });
  const optimized = types.buildActiveTransferTableValues({
    ...settings,
    hard8JndOptimizationEnabled: true,
  });

  assert.equal(new Set(optimized.map((value) => Math.round(value * 255))).size, 225);
  assert.notDeepEqual(optimized, original);
  assert.equal(optimized[0], 0);
  assert.equal(optimized.at(-1), 1);
});
