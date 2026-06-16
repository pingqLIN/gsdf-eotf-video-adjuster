import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const contentSource = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');

function createContentContext() {
  const listeners = [];
  const intervals = [];
  const bodyChildren = [];
  const document = {
    body: {
      appendChild(element) {
        bodyChildren.push(element);
      }
    },
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
        }
      };
    },
    createElementNS() {
      return {
        style: {},
        setAttribute() {},
        appendChild() {},
        remove() {}
      };
    },
    getElementById() {
      return null;
    }
  };
  const sandboxWindow = {
    __GSDF_EOTF_TEST__: true,
    innerWidth: 1280,
    innerHeight: 720,
    scrollX: 0,
    scrollY: 0,
    location: {
      hostname: 'www.youtube.com',
      pathname: '/watch'
    },
    document,
    addEventListener(type, callback) {
      listeners.push({ type, callback });
    },
    getComputedStyle() {
      return {
        display: 'block',
        visibility: 'visible',
        opacity: '1'
      };
    },
    setInterval(callback, delay) {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    clearInterval() {}
  };
  sandboxWindow.window = sandboxWindow;
  sandboxWindow.globalThis = sandboxWindow;

  const context = vm.createContext({
    console,
    window: sandboxWindow,
    globalThis: sandboxWindow,
    document,
    chrome: {
      runtime: {
        getURL: (path) => `chrome-extension://test/${path}`,
        onMessage: {
          addListener() {}
        }
      }
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
    cancelAnimationFrame() {}
  });
  context.__testState = { bodyChildren, intervals, listeners };

  return context;
}

function loadContentHooks() {
  const context = createContentContext();
  vm.runInContext(contentSource, context, { filename: 'extension/content.js' });
  return context.window.__gsdfEotfTestHooks;
}

function makeVideo(overrides = {}) {
  const matchers = new Set(overrides.closestMatchers ?? []);
  return {
    isConnected: overrides.isConnected ?? true,
    readyState: overrides.readyState ?? 4,
    paused: overrides.paused ?? false,
    ended: overrides.ended ?? false,
    currentTime: overrides.currentTime ?? 20,
    muted: overrides.muted ?? false,
    videoWidth: overrides.videoWidth ?? 1920,
    videoHeight: overrides.videoHeight ?? 1080,
    getBoundingClientRect() {
      return overrides.rect ?? { left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540 };
    },
    closest(selector) {
      for (const matcher of matchers) {
        if (selector.includes(matcher)) {
          return {};
        }
      }
      return null;
    }
  };
}

test('derives a richer GSDF tone profile from luminance and image controls', () => {
  const hooks = loadContentHooks();
  assert.ok(hooks, 'content script should expose test hooks');

  const profile = hooks.deriveToneProfile({
    enabled: true,
    lmax: 180,
    gammaTarget: 1.8,
    strength: 80,
    blackPoint: 6,
    whitePoint: 96,
    sharpness: 45,
    temperature: 35,
    saturation: 125,
    hue: -15
  });

  assert.notEqual(profile.gsdfTableValues[128], Number((128 / 255).toFixed(5)), 'low target luminance should bend the GSDF table');
  assert.ok(profile.levelSlope > 1, 'black/white point compression should increase slope');
  assert.equal(profile.sharpenFilterId, 'gsdf-eotf-sharpen-3');
  assert.ok(profile.temperatureMatrix[0] > profile.temperatureMatrix[10], 'warm temperature should lift red over blue');
  assert.equal(profile.saturationValue, 1.25);
  assert.equal(profile.hueValue, -15);
});

test('content script can be injected repeatedly without redeclaring globals', () => {
  const context = createContentContext();

  vm.runInContext(contentSource, context, { filename: 'extension/content.js' });

  assert.doesNotThrow(() => {
    vm.runInContext(contentSource, context, { filename: 'extension/content.js' });
  });
  assert.ok(context.window.__gsdfEotfTestHooks, 'test hooks should remain available after duplicate injection');
});

test('content script exposes a direct toggle API for fallback activation', () => {
  const context = createContentContext();

  vm.runInContext(contentSource, context, { filename: 'extension/content.js' });

  assert.equal(typeof context.window.__GSDF_EOTF_CONTENT__?.toggleUI, 'function');

  context.window.__GSDF_EOTF_CONTENT__.toggleUI();

  assert.equal(context.__testState.bodyChildren.length, 1);
  assert.equal(context.__testState.bodyChildren[0].id, 'gsdf-eotf-ui-iframe');
  assert.equal(context.__testState.bodyChildren[0].allow, 'camera');
});

test('content script opens the full GSDF pattern view as a movable and resizable frame', () => {
  const context = createContentContext();

  vm.runInContext(contentSource, context, { filename: 'extension/content.js' });
  context.window.__GSDF_EOTF_CONTENT__.toggleUI();

  const iframe = context.__testState.bodyChildren[0];
  const messageListener = context.__testState.listeners.find((listener) => listener.type === 'message');
  assert.equal(iframe.style.width, '400px');
  assert.equal(iframe.style.height, '680px');
  assert.ok(messageListener, 'message listener should be registered');

  messageListener.callback({
    source: iframe.contentWindow,
    data: {
      type: 'GSDF_PATTERN_VIEW_CHANGED',
      payload: { open: true }
    }
  });

  assert.equal(iframe.style.width, '1160px');
  assert.equal(iframe.style.height, '640px');
  assert.equal(iframe.style.left, '8px');
  assert.equal(iframe.style.top, '8px');

  messageListener.callback({
    source: iframe.contentWindow,
    data: {
      type: 'GSDF_PANEL_DRAGGED',
      payload: { deltaX: 48, deltaY: 32 }
    }
  });

  assert.equal(iframe.style.left, '56px');
  assert.equal(iframe.style.top, '40px');

  messageListener.callback({
    source: iframe.contentWindow,
    data: {
      type: 'GSDF_PANEL_RESIZED',
      payload: { deltaWidth: 200, deltaHeight: 120 }
    }
  });

  assert.equal(iframe.style.width, '1264px');
  assert.equal(iframe.style.height, '704px');
  assert.equal(iframe.style.left, '16px');
  assert.equal(iframe.style.top, '16px');

  messageListener.callback({
    source: iframe.contentWindow,
    data: {
      type: 'GSDF_PATTERN_VIEW_CHANGED',
      payload: { open: false }
    }
  });

  assert.equal(iframe.style.width, '400px');
  assert.equal(iframe.style.height, '680px');
});

test('content script keeps a stable default panel size', () => {
  const context = createContentContext();

  vm.runInContext(contentSource, context, { filename: 'extension/content.js' });
  context.window.__GSDF_EOTF_CONTENT__.toggleUI();

  const iframe = context.__testState.bodyChildren[0];
  const messageListener = context.__testState.listeners.find((listener) => listener.type === 'message');
  assert.equal(iframe.style.width, '400px');
  assert.equal(iframe.style.height, '680px');
  assert.ok(messageListener, 'message listener should be registered');
  assert.doesNotMatch(contentSource, /GSDF_PANEL_MODE_CHANGED/);

  messageListener.callback({
    source: iframe.contentWindow,
    data: {
      type: 'GSDF_PANEL_RESIZED',
      payload: { deltaWidth: 80, deltaHeight: -80 }
    }
  });

  assert.equal(iframe.style.width, '480px');
  assert.equal(iframe.style.height, '600px');
});

test('maps target luminance on a 10 to 500 nits logarithmic slider', () => {
  const hooks = loadContentHooks();

  assert.equal(hooks.normalizeSettings({ lmax: 1 }).lmax, 10);
  assert.equal(hooks.normalizeSettings({ lmax: 900 }).lmax, 500);
  assert.equal(hooks.normalizeSettings({}).lmax, 100);
  assert.equal(hooks.normalizeSettings({}).blackPoint, 6);
  assert.equal(hooks.normalizeSettings({}).whitePoint, 90);
  assert.equal(hooks.normalizeSettings({}).sharpness, 5);
  assert.equal(hooks.normalizeSettings({}).gammaTarget, 2.2);
  assert.equal(hooks.normalizeSettings({}).displayGamut, 'srgb');
  assert.equal(hooks.normalizeSettings({}).strength, 90);
  assert.equal(hooks.normalizeSettings({}).saturation, 90);
  assert.equal(hooks.normalizeSettings({}).hue, 0);
  assert.equal(hooks.normalizeSettings({ displayGamut: 'display-p3' }).displayGamut, 'display-p3');
  assert.equal(hooks.normalizeSettings({ gammaTarget: 0.5 }).gammaTarget, 1.0);
  assert.equal(hooks.normalizeSettings({ gammaTarget: 4 }).gammaTarget, 3.0);
  assert.equal(hooks.normalizeSettings({ gammaTarget: 1.2367 }).gammaTarget, 1.237);
  assert.equal(hooks.normalizeSettings({ saturation: -20 }).saturation, 0);
  assert.equal(hooks.normalizeSettings({ sharpness: 80 }).sharpness, 50);
  assert.equal(hooks.normalizeSettings({ saturation: 240 }).saturation, 125);
  assert.equal(hooks.normalizeSettings({ hue: -220 }).hue, -30);
  assert.equal(hooks.normalizeSettings({ hue: 220 }).hue, 30);
  assert.equal(hooks.gammaCorrectionToTarget(-100), 3.0);
  assert.equal(hooks.gammaCorrectionToTarget(0), 2.2);
  assert.equal(hooks.gammaCorrectionToTarget(100), 1.0);
  assert.notEqual(hooks.gammaCorrectionToTarget(-49), hooks.gammaCorrectionToTarget(-50));
  assert.notEqual(hooks.gammaCorrectionToTarget(49), hooks.gammaCorrectionToTarget(50));
  assert.equal(hooks.gammaTargetToCorrection(3.0), -100);
  assert.equal(hooks.gammaTargetToCorrection(2.2), 0);
  assert.equal(hooks.gammaTargetToCorrection(1.0), 100);
  assert.equal(hooks.normalizeSettings({ curveMode: 'pure' }).curveMode, 'relative');
  assert.equal(hooks.normalizeSettings({ curveMode: 'unknown' }).curveMode, 'relative');
  assert.equal(hooks.normalizeSettings({ displayGamut: 'adobe-rgb' }).displayGamut, 'adobe-rgb');
  assert.equal(hooks.normalizeSettings({ displayGamut: 'rec2020' }).displayGamut, 'srgb');
  assert.equal(hooks.sliderValueToLuminance(0), 10);
  assert.equal(hooks.sliderValueToLuminance(1000), 500);

  const midpoint = hooks.sliderValueToLuminance(500);
  assert.ok(midpoint > 70 && midpoint < 71, 'log midpoint should be geometric, not linear');

  const lowStep = hooks.sliderValueToLuminance(101) - hooks.sliderValueToLuminance(100);
  const highStep = hooks.sliderValueToLuminance(901) - hooks.sliderValueToLuminance(900);
  assert.ok(lowStep < highStep, 'log scale should provide finer absolute control at low nits');
});

test('derives luminance-aware recommended image defaults', () => {
  const hooks = loadContentHooks();
  const defaultsAt = (lmax) => ({ ...hooks.getRecommendedImageDefaults(lmax) });

  assert.deepEqual(defaultsAt(10), {
    displayGamut: 'srgb',
    blackPoint: 10,
    whitePoint: 90,
    saturation: 90
  });
  assert.deepEqual(defaultsAt(50), {
    displayGamut: 'srgb',
    blackPoint: 8,
    whitePoint: 97,
    saturation: 100
  });
  assert.deepEqual(defaultsAt(75), {
    displayGamut: 'srgb',
    blackPoint: 7,
    whitePoint: 94,
    saturation: 95
  });
  assert.deepEqual(defaultsAt(100), {
    displayGamut: 'srgb',
    blackPoint: 6,
    whitePoint: 90,
    saturation: 90
  });
  assert.deepEqual(defaultsAt(350), {
    displayGamut: 'srgb',
    blackPoint: 3,
    whitePoint: 96,
    saturation: 90
  });
  assert.deepEqual(defaultsAt(500), {
    displayGamut: 'srgb',
    blackPoint: 0,
    whitePoint: 100,
    saturation: 90
  });
  assert.equal(hooks.normalizeSettings({ lmax: 350 }).blackPoint, 3);
  assert.equal(hooks.normalizeSettings({ lmax: 350 }).whitePoint, 96);
  assert.equal(hooks.normalizeSettings({ lmax: 350, blackPoint: 7, whitePoint: 94, saturation: 105 }).blackPoint, 7);
  assert.equal(hooks.normalizeSettings({ lmax: 350, blackPoint: 7, whitePoint: 94, saturation: 105 }).whitePoint, 94);
  assert.equal(hooks.normalizeSettings({ lmax: 350, blackPoint: 7, whitePoint: 94, saturation: 105 }).saturation, 105);
});

test('applies the full GSDF table at every target luminance and uses strength as the filter amount', () => {
  const hooks = loadContentHooks();
  const noFilter = hooks.deriveToneProfile({ enabled: true, lmax: 350, strength: 0 });
  const defaultTarget = hooks.deriveToneProfile({ enabled: true, lmax: 350, strength: 100 });
  const high = hooks.deriveToneProfile({ enabled: true, lmax: 500, strength: 100 });
  const dim = hooks.deriveToneProfile({ enabled: true, lmax: 150, strength: 100 });
  const identityMid = Number((128 / 255).toFixed(5));
  const defaultDelta = Math.abs(defaultTarget.gsdfTableValues[128] - identityMid);
  const highDelta = Math.abs(high.gsdfTableValues[128] - identityMid);
  const dimDelta = Math.abs(dim.gsdfTableValues[128] - identityMid);

  assert.equal(noFilter.gsdfTableValues[128], identityMid);
  assert.equal(defaultTarget.gsdfTableValues[0], 0);
  assert.equal(defaultTarget.gsdfTableValues[255], 1);
  assert.ok(defaultDelta > 0.00001);
  assert.ok(highDelta > 0.00001, '500 nits should no longer be treated as a neutral no-filter anchor');
  assert.ok(dimDelta > 0.00001);
  assert.notEqual(defaultTarget.gsdfTableValues[64], high.gsdfTableValues[64]);
  assert.notEqual(defaultTarget.gsdfTableValues[64], dim.gsdfTableValues[64]);
});

test('uses the DICOM GSDF JND luminance formula for the transfer table', () => {
  const hooks = loadContentHooks();

  assert.ok(Math.abs(hooks.gsdfJndToLuminance(1) - 0.05) < 0.001);
  assert.ok(Math.abs(hooks.gsdfJndToLuminance(256) - 15.238) < 0.02);
  assert.ok(Math.abs(hooks.gsdfJndToLuminance(512) - 130.065) < 0.05);
  assert.ok(Math.abs(hooks.gsdfJndToLuminance(1023) - 3993) < 8);

  const sampledJnds = [1, 64, 128, 256, 512, 768, 1023];
  const sampledLuminance = sampledJnds.map((jnd) => hooks.gsdfJndToLuminance(jnd));
  for (let index = 1; index < sampledLuminance.length; index += 1) {
    assert.ok(sampledLuminance[index] > sampledLuminance[index - 1], `JND ${sampledJnds[index]} should be brighter than ${sampledJnds[index - 1]}`);
  }

  const table = hooks.buildGsdfTableValues({ lmax: 10, strength: 100 });
  assert.equal(table.length, 256);
  assert.equal(table[0], 0);
  assert.equal(table[255], 1);
  assert.ok(table[16] > 0 && table[16] < table[128]);
  assert.ok(table[128] < table[240]);
});

test('strength controls the full GSDF filter amount', () => {
  const hooks = loadContentHooks();
  const identityMid = Number((128 / 255).toFixed(5));
  const offTable = hooks.buildGsdfTableValues({ lmax: 100, strength: 0 });
  const mediumTable = hooks.buildGsdfTableValues({ lmax: 100, strength: 50 });
  const fullTable = hooks.buildGsdfTableValues({ lmax: 100, strength: 100, curveMode: 'pure' });
  const mediumDelta = Math.abs(mediumTable[128] - identityMid);
  const fullDelta = Math.abs(fullTable[128] - identityMid);

  assert.equal(offTable[128], identityMid);
  assert.ok(mediumDelta > 0);
  assert.ok(fullDelta > mediumDelta);
  assert.equal(fullTable[0], 0);
  assert.equal(fullTable[255], 1);
});

test('gamma target is applied before the GSDF filter amount blend', () => {
  const hooks = loadContentHooks();
  const identityMid = Number((128 / 255).toFixed(5));
  const defaultGamma = hooks.buildGsdfTableValues({ lmax: 350, strength: 0, gammaTarget: 2.2 });
  const liftedGamma = hooks.buildGsdfTableValues({ lmax: 350, strength: 0, gammaTarget: 1.0 });
  const deepenedGamma = hooks.buildGsdfTableValues({ lmax: 350, strength: 0, gammaTarget: 3.0 });
  const liftedGsdf = hooks.buildGsdfTableValues({ lmax: 350, strength: 100, gammaTarget: 1.0 });
  const defaultGsdf = hooks.buildGsdfTableValues({ lmax: 350, strength: 100, gammaTarget: 2.2 });

  assert.equal(defaultGamma[128], identityMid);
  assert.ok(hooks.getGammaAdjustedInputLevel(0.5, 1.0) > 0.5);
  assert.ok(hooks.getGammaAdjustedInputLevel(0.5, 3.0) < 0.5);
  assert.ok(liftedGamma[128] > identityMid, 'gamma 1.0 should lift mid-level code values before GSDF');
  assert.ok(deepenedGamma[128] < identityMid, 'gamma 3.0 should deepen mid-level code values before GSDF');
  assert.notEqual(liftedGsdf[128], defaultGsdf[128], 'GSDF should consume the gamma-adjusted input level');
});

test('display gamut selects the CSDF luma/chroma managed filter', () => {
  const hooks = loadContentHooks();
  const srgbProfile = hooks.deriveToneProfile({
    enabled: true,
    lmax: 100,
    strength: 100,
    displayGamut: 'srgb'
  });
  const p3Profile = hooks.deriveToneProfile({
    enabled: true,
    lmax: 100,
    strength: 100,
    displayGamut: 'display-p3'
  });

  const filter = hooks.buildManagedFilterChain('', srgbProfile);

  assert.match(filter, /url\("#gsdf-eotf-csdf"\)/);
  assert.doesNotMatch(filter, /url\("#gsdf-eotf-gamma"\)/);
  assert.notEqual(srgbProfile.csdfForwardMatrix[0], p3Profile.csdfForwardMatrix[0]);
});

test('replaces stale GSDF filters while preserving host page filter tokens', () => {
  const hooks = loadContentHooks();
  const profile = hooks.deriveToneProfile({
    enabled: true,
    lmax: 800,
    strength: 70,
    displayGamut: 'adobe-rgb',
    blackPoint: 2,
    whitePoint: 98,
    sharpness: 20,
    temperature: -20
  });

  const filter = hooks.buildManagedFilterChain(
    'brightness(90%) url("#gsdf-eotf-gamma") contrast(105%)',
    profile
  );

  assert.match(filter, /brightness\(90%\)/);
  assert.match(filter, /contrast\(105%\)/);
  assert.doesNotMatch(filter, /saturate\(/);
  assert.doesNotMatch(filter, /gsdf-eotf-gamma/);
  assert.equal((filter.match(/gsdf-eotf-csdf/g) ?? []).length, 1);
  assert.match(filter, /url\("#gsdf-eotf-temp"\)/);
  assert.match(filter, /url\("#gsdf-eotf-color"\)/);
});

test('selects the YouTube watch player over muted preview videos', () => {
  const hooks = loadContentHooks();
  const preview = makeVideo({
    rect: { left: 1040, top: 80, right: 1240, bottom: 192, width: 200, height: 112 },
    paused: true,
    muted: true,
    closestMatchers: ['ytd-rich-grid-media']
  });
  const main = makeVideo({
    rect: { left: 80, top: 80, right: 1040, bottom: 620, width: 960, height: 540 },
    closestMatchers: ['#movie_player']
  });

  const selected = hooks.selectTargetVideos([preview, main], {
    location: { hostname: 'www.youtube.com', pathname: '/watch' },
    viewport: { width: 1280, height: 720 },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
  });

  assert.deepEqual(selected, [main]);
}
);
