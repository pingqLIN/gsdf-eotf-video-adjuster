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

function getTag(parsed, signature) {
  const tag = parsed.tags.find((entry) => entry.signature === signature);
  assert.ok(tag, `expected ${signature} tag`);
  return tag;
}

function maxDifference(left, right) {
  const length = Math.min(left.length, right.length);
  let delta = 0;

  for (let index = 0; index < length; index += 1) {
    delta = Math.max(delta, Math.abs(left[index] - right[index]));
  }

  return delta;
}

test('builds a valid ICC v2 Matrix/TRC display profile', async () => {
  const { buildVirtualDisplayIcc } = await loadTsModule('../src/icc/buildVirtualDisplayIcc.ts');
  const {
    parseIccProfile,
    readCurveTag,
    readTextDescriptionTag,
    readXyzTag,
    validateVirtualDisplayIcc,
  } = await loadTsModule('../src/icc/validateIcc.ts');
  const result = buildVirtualDisplayIcc({
    lmax: 160,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    transferFormula: 'csdf',
    displayGamut: 'display-p3',
    strength: 80,
  }, {
    profileIntent: 'compensation',
    trcSampleCount: 4096,
    displayPreset: 'oled-zero-black',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  });
  const parsed = parseIccProfile(result.bytes);
  const desc = readTextDescriptionTag(result.bytes, getTag(parsed, 'desc'));
  const rCurve = readCurveTag(result.bytes, getTag(parsed, 'rTRC'));
  const gCurve = readCurveTag(result.bytes, getTag(parsed, 'gTRC'));
  const bCurve = readCurveTag(result.bytes, getTag(parsed, 'bTRC'));
  const redXyz = readXyzTag(result.bytes, getTag(parsed, 'rXYZ'));

  assert.deepEqual(validateVirtualDisplayIcc(result.bytes, 4096), []);
  assert.equal(parsed.size, result.bytes.length);
  assert.equal(parsed.versionMajor, 2);
  assert.equal(parsed.deviceClass, 'mntr');
  assert.equal(parsed.colorSpace, 'RGB ');
  assert.equal(parsed.pcs, 'XYZ ');
  assert.match(desc, /LumaLift CSDF compensation display-p3 oled-zero-black L160/);
  assert.equal(rCurve.length, 4096);
  assert.equal(maxDifference(rCurve, gCurve), 0);
  assert.equal(maxDifference(rCurve, bCurve), 0);
  assert.ok(Number.isFinite(redXyz.x) && Number.isFinite(redXyz.y) && Number.isFinite(redXyz.z));
  assert.ok(redXyz.y > 0 && Math.abs(redXyz.x) + Math.abs(redXyz.y) + Math.abs(redXyz.z) > 0.0001);
  assert.match(result.fileName, /^LumaLift_CSDF_compensation_displayp3_oledzeroblack_L160_B0\.0005_G2\.2_S80\.icc$/);
});

test('compensation and descriptive ICC TRCs diverge for the same non-identity settings', async () => {
  const { buildVirtualDisplayIcc } = await loadTsModule('../src/icc/buildVirtualDisplayIcc.ts');
  const { parseIccProfile, readCurveTag } = await loadTsModule('../src/icc/validateIcc.ts');
  const settings = {
    lmax: 120,
    gammaTarget: 2.4,
    displayGamma: 2.2,
    transferFormula: 'csdf',
    displayGamut: 'adobe-rgb',
    strength: 90,
  };
  const compensation = buildVirtualDisplayIcc(settings, {
    profileIntent: 'compensation',
    trcSampleCount: 4096,
    displayPreset: 'black-ips-2000',
  });
  const descriptive = buildVirtualDisplayIcc(settings, {
    profileIntent: 'descriptive',
    trcSampleCount: 4096,
    displayPreset: 'black-ips-2000',
  });
  const compensationCurve = readCurveTag(compensation.bytes, getTag(parseIccProfile(compensation.bytes), 'rTRC'));
  const descriptiveCurve = readCurveTag(descriptive.bytes, getTag(parseIccProfile(descriptive.bytes), 'rTRC'));

  assert.ok(maxDifference(compensationCurve, descriptiveCurve) > 0.0001);
});

test('ICC colorants are D50-adapted and change with virtual gamut', async () => {
  const { buildVirtualDisplayIcc } = await loadTsModule('../src/icc/buildVirtualDisplayIcc.ts');
  const { parseIccProfile, readXyzTag } = await loadTsModule('../src/icc/validateIcc.ts');
  const base = {
    lmax: 100,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    transferFormula: 'gsdf',
    strength: 100,
  };
  const srgb = buildVirtualDisplayIcc({ ...base, displayGamut: 'srgb' }, { trcSampleCount: 4096 });
  const p3 = buildVirtualDisplayIcc({ ...base, displayGamut: 'display-p3' }, { trcSampleCount: 4096 });
  const srgbRed = readXyzTag(srgb.bytes, getTag(parseIccProfile(srgb.bytes), 'rXYZ'));
  const p3Red = readXyzTag(p3.bytes, getTag(parseIccProfile(p3.bytes), 'rXYZ'));

  assert.ok(Math.abs(srgbRed.x - p3Red.x) > 0.01);
  assert.ok(Math.abs(srgbRed.y - p3Red.y) > 0.005);
});
