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
    strength: 80,
    blackPoint: 6,
    whitePoint: 96,
    sharpness: 55,
    temperature: 35
  });

  assert.ok(profile.gammaExponent > 1, 'low target luminance should increase gamma exponent');
  assert.ok(profile.levelSlope > 1, 'black/white point compression should increase slope');
  assert.equal(profile.sharpenFilterId, 'gsdf-eotf-sharpen-2');
  assert.ok(profile.temperatureMatrix[0] > profile.temperatureMatrix[10], 'warm temperature should lift red over blue');
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
});

test('maps target luminance on a 10 to 500 nits logarithmic slider', () => {
  const hooks = loadContentHooks();

  assert.equal(hooks.normalizeSettings({ lmax: 1 }).lmax, 10);
  assert.equal(hooks.normalizeSettings({ lmax: 900 }).lmax, 500);
  assert.equal(hooks.normalizeSettings({ inputGamma: 0.5 }).inputGamma, 1);
  assert.equal(hooks.normalizeSettings({ inputGamma: 3 }).inputGamma, 2.6);
  assert.equal(hooks.sliderValueToLuminance(0), 10);
  assert.equal(hooks.sliderValueToLuminance(1000), 500);

  const midpoint = hooks.sliderValueToLuminance(500);
  assert.ok(midpoint > 70 && midpoint < 71, 'log midpoint should be geometric, not linear');

  const lowStep = hooks.sliderValueToLuminance(101) - hooks.sliderValueToLuminance(100);
  const highStep = hooks.sliderValueToLuminance(901) - hooks.sliderValueToLuminance(900);
  assert.ok(lowStep < highStep, 'log scale should provide finer absolute control at low nits');
});

test('uses configurable input gamma for GSDF transfer table mapping', () => {
  const hooks = loadContentHooks();

  const linearTable = hooks.buildGsdfTableValues({ lmax: 500, strength: 100, inputGamma: 1 });
  const gammaTable = hooks.buildGsdfTableValues({ lmax: 500, strength: 100, inputGamma: 2.2 });

  assert.equal(linearTable.length, 256);
  assert.equal(gammaTable.length, 256);
  assert.equal(gammaTable[0], 0);
  assert.equal(gammaTable[255], 1);
  assert.equal(linearTable[128], 0.31018);
  assert.equal(gammaTable[128], 0.11841);
  assert.notEqual(gammaTable[128], linearTable[128]);
  assert.ok(gammaTable[128] > 0 && gammaTable[128] < gammaTable[240]);

  const highGammaTable = hooks.buildGsdfTableValues({ lmax: 500, strength: 100, inputGamma: 2.6 });
  assert.equal(highGammaTable[128], 0.09062);
  assert.ok(highGammaTable[128] < gammaTable[128]);
});

test('keeps 500 nits neutral and makes 10 nits the strongest low luminance curve', () => {
  const hooks = loadContentHooks();
  const neutral = hooks.deriveToneProfile({ enabled: true, lmax: 500, strength: 100 });
  const dim = hooks.deriveToneProfile({ enabled: true, lmax: 100, strength: 100 });
  const veryDim = hooks.deriveToneProfile({ enabled: true, lmax: 10, strength: 100 });

  assert.equal(neutral.gammaExponent, 1);
  assert.ok(dim.gammaExponent > neutral.gammaExponent);
  assert.ok(veryDim.gammaExponent > dim.gammaExponent);
});

test('uses the DICOM GSDF JND luminance formula for the transfer table', () => {
  const hooks = loadContentHooks();

  assert.ok(Math.abs(hooks.gsdfJndToLuminance(1) - 0.05) < 0.001);
  assert.ok(Math.abs(hooks.gsdfJndToLuminance(1023) - 3993) < 8);

  const table = hooks.buildGsdfTableValues({ lmax: 500, strength: 100 });
  assert.equal(table.length, 256);
  assert.equal(table[0], 0);
  assert.equal(table[255], 1);
  assert.ok(table[16] > 0 && table[16] < table[128]);
  assert.ok(table[128] < table[240]);
});

test('replaces stale GSDF filters while preserving host page filter tokens', () => {
  const hooks = loadContentHooks();
  const profile = hooks.deriveToneProfile({
    enabled: true,
    lmax: 800,
    strength: 70,
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
  assert.equal((filter.match(/gsdf-eotf-gamma/g) ?? []).length, 1);
  assert.match(filter, /url\("#gsdf-eotf-temp"\)/);
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
