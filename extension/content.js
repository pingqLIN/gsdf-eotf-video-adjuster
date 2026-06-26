// This content script injects the React UI iframe and applies managed video filters.
(() => {
const existingContentApi = globalThis.__GSDF_EOTF_CONTENT__;
if (existingContentApi?.status === 'ready') {
  return;
}
globalThis.__GSDF_EOTF_CONTENT__ = { status: 'loading' };

const DEFAULT_SETTINGS = {
  enabled: false,
  lmax: 100,
  curveMode: 'relative',
  gammaTarget: 2.2,
  displayGamma: 2.2,
  sourceIsLinear: false,
  displayGamut: 'srgb',
  strength: 100,
  blackPoint: 0,
  whitePoint: 256,
  fineSharpness: 0,
  mediumSharpness: 0,
  temperature: 0,
  saturation: 100,
  grayscale: false,
  hue: 0
};

const LUMINANCE_MIN_NITS = 10;
const LUMINANCE_MAX_NITS = 500;
const LUMINANCE_SLIDER_MAX = 1000;
const GAMMA_TARGET_MIN = 1.0;
const GAMMA_TARGET_MAX = 3.0;
const DEFAULT_GAMMA_TARGET = 2.2;
const GAMMA_CORRECTION_MIN = -100;
const GAMMA_CORRECTION_MAX = 100;
const TONE_LEVEL_COUNT = 256;
const BLACK_CLIP_TONE_MIN = 0;
const BLACK_CLIP_TONE_MAX = 16;
const WHITE_CLIP_TONE_MIN = 240;
const WHITE_CLIP_TONE_MAX = 256;
const SATURATION_MIN = 50;
const SATURATION_MAX = 150;
const TEMPERATURE_MIN_K = -1000;
const TEMPERATURE_MAX_K = 1000;
const LUMINANCE_LOG_RANGE = Math.log(LUMINANCE_MAX_NITS / LUMINANCE_MIN_NITS);
const GSDF_DISPLAY_LMIN_NITS = 0.05;
const GSDF_JND_MIN = 1;
const GSDF_JND_MAX = 1023;
const GSDF_TABLE_SIZE = 256;
const DISPLAY_GAMUT_PROFILES = {
  srgb: { kr: 0.2126, kg: 0.7152, kb: 0.0722 },
  'display-p3': { kr: 0.2290, kg: 0.6917, kb: 0.0793 },
  'adobe-rgb': { kr: 0.2974, kg: 0.6274, kb: 0.0752 }
};
const DEFAULT_BLACK_POINT = 0;
const DEFAULT_WHITE_POINT = TONE_LEVEL_COUNT;
const DEFAULT_SATURATION = 100;
const DISPLAY_GAMMA_OPTIONS = [1, 1.8, 2.2, 2.4, 2.6];
const GSDF_COEFFICIENTS = {
  a: -1.3011877,
  b: -2.5840191e-2,
  c: 8.0242636e-2,
  d: -1.0320229e-1,
  e: 1.3646699e-1,
  f: 2.8745620e-2,
  g: -2.5468404e-2,
  h: -3.1978977e-3,
  k: 1.2992634e-4,
  m: 1.3635334e-3
};
const FILTER_CONTAINER_ID = 'gsdf-eotf-svg-filter-container';
const FILTER_IDS = {
  gamma: 'gsdf-eotf-gamma',
  csdf: 'gsdf-eotf-csdf',
  levels: 'gsdf-eotf-levels',
  temperature: 'gsdf-eotf-temp',
  color: 'gsdf-eotf-color',
  sharpenFine: 'gsdf-eotf-sharpen-fine',
  sharpenMedium: 'gsdf-eotf-sharpen-medium'
};
const MANAGED_FILTER_RE =
  /\s*url\((["']?)#gsdf-eotf-(?:gamma|ycbcr|csdf|levels|temp|color|sharpen-(?:[123]|fine|medium))\1\)\s*/g;
const MIN_VISIBLE_AREA = 8000;
const PANEL_VIEWPORT_MARGIN = 16;
const PANEL_DEFAULT_WIDTH = 400;
const PANEL_DEFAULT_MAX_HEIGHT = 680;
const PANEL_DEFAULT_MIN_HEIGHT = 520;
const PANEL_DEFAULT_MIN_WIDTH = 400;
const PANEL_PATTERN_MARGIN = 8;
const PANEL_PATTERN_DEFAULT_WIDTH = 1160;
const PANEL_PATTERN_DEFAULT_HEIGHT = 640;
const PANEL_PATTERN_MIN_WIDTH = 560;
const PANEL_PATTERN_MIN_HEIGHT = 420;

let uiIframe = null;
let svgFilterInjected = false;
let currentSettings = { ...DEFAULT_SETTINGS };
let panelPosition = { x: 24, y: 24 };
let panelFrameSize = null;
let panelPatternFrame = null;
let panelExpandedForPattern = false;
let scanTimer = null;
let mutationObserver = null;
let pendingPanelDrag = null;
let pendingPanelDragFrame = 0;
const managedVideos = new Set();
const originalVideoStyles = new WeakMap();

function scheduleAnimationFrame(callback) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }

  return setTimeout(callback, 16);
}

function clampNumber(value, min, max, fallback = min) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, numeric));
}

function roundLuminance(value) {
  return Number(value.toFixed(value < 100 ? 1 : 0));
}

function clampRecommendedLuminance(value) {
  const numeric = Number(value);
  const clamped = Number.isFinite(numeric)
    ? Math.max(LUMINANCE_MIN_NITS, Math.min(LUMINANCE_MAX_NITS, numeric))
    : DEFAULT_SETTINGS.lmax;

  return roundLuminance(clamped);
}

function getRecommendedImageDefaults(lmax) {
  clampRecommendedLuminance(lmax);

  return {
    displayGamut: 'srgb',
    blackPoint: DEFAULT_BLACK_POINT,
    whitePoint: DEFAULT_WHITE_POINT,
    saturation: DEFAULT_SATURATION
  };
}

function normalizeCurveMode(_value) {
  return DEFAULT_SETTINGS.curveMode;
}

function normalizeDisplayGamut(value) {
  return Object.prototype.hasOwnProperty.call(DISPLAY_GAMUT_PROFILES, value) ? value : DEFAULT_SETTINGS.displayGamut;
}

function hasNewImageControlSchema(settings) {
  return (
    settings.displayGamma !== undefined ||
    settings.fineSharpness !== undefined ||
    settings.mediumSharpness !== undefined ||
    settings.grayscale !== undefined ||
    Number(settings.whitePoint) > 100 ||
    Math.abs(Number(settings.temperature)) > 50
  );
}

function migrateLegacyWhitePercent(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const percent = clampNumber(value, 80, 100, 90);
  const tone = percent <= 90
    ? 240 + (percent - 80)
    : 250 + (percent - 90) * 0.6;

  return Math.round(clampNumber(tone, WHITE_CLIP_TONE_MIN, WHITE_CLIP_TONE_MAX, fallback));
}

function migrateLegacyTemperature(value) {
  return Math.round(clampNumber(value, -50, 50, 0) * 20);
}

function normalizeGammaTarget(value) {
  return Number(clampNumber(value, GAMMA_TARGET_MIN, GAMMA_TARGET_MAX, DEFAULT_SETTINGS.gammaTarget).toFixed(3));
}

function normalizeDisplayGamma(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SETTINGS.gammaTarget;
  }

  const normalized = Number(numeric.toFixed(3));

  return DISPLAY_GAMMA_OPTIONS.includes(normalized) ? normalized : DEFAULT_SETTINGS.gammaTarget;
}

function gammaCorrectionToTarget(value) {
  const correction = clampNumber(value, GAMMA_CORRECTION_MIN, GAMMA_CORRECTION_MAX, 0);

  if (correction < 0) {
    const ratio = Math.abs(correction) / Math.abs(GAMMA_CORRECTION_MIN);
    return normalizeGammaTarget(DEFAULT_GAMMA_TARGET + (GAMMA_TARGET_MAX - DEFAULT_GAMMA_TARGET) * ratio);
  }

  const ratio = correction / GAMMA_CORRECTION_MAX;
  return normalizeGammaTarget(DEFAULT_GAMMA_TARGET - (DEFAULT_GAMMA_TARGET - GAMMA_TARGET_MIN) * ratio);
}

function gammaTargetToCorrection(value) {
  const target = normalizeGammaTarget(value);

  if (target > DEFAULT_GAMMA_TARGET) {
    return Math.round(-((target - DEFAULT_GAMMA_TARGET) / (GAMMA_TARGET_MAX - DEFAULT_GAMMA_TARGET)) * Math.abs(GAMMA_CORRECTION_MIN));
  }

  if (target < DEFAULT_GAMMA_TARGET) {
    return Math.round(((DEFAULT_GAMMA_TARGET - target) / (DEFAULT_GAMMA_TARGET - GAMMA_TARGET_MIN)) * GAMMA_CORRECTION_MAX);
  }

  return 0;
}

function clampLuminance(value) {
  return roundLuminance(clampNumber(value, LUMINANCE_MIN_NITS, LUMINANCE_MAX_NITS, DEFAULT_SETTINGS.lmax));
}

function sliderValueToLuminance(value) {
  const sliderValue = clampNumber(value, 0, LUMINANCE_SLIDER_MAX, LUMINANCE_SLIDER_MAX);
  const ratio = sliderValue / LUMINANCE_SLIDER_MAX;

  return roundLuminance(LUMINANCE_MIN_NITS * Math.exp(LUMINANCE_LOG_RANGE * ratio));
}

function luminanceToSliderValue(lmax) {
  const luminance = clampLuminance(lmax);
  const ratio = Math.log(luminance / LUMINANCE_MIN_NITS) / LUMINANCE_LOG_RANGE;

  return Math.round(clampNumber(ratio, 0, 1, 1) * LUMINANCE_SLIDER_MAX);
}

function gsdfJndToLuminance(jndIndex) {
  const j = clampNumber(jndIndex, GSDF_JND_MIN, GSDF_JND_MAX, GSDF_JND_MIN);
  const lnJ = Math.log(j);
  const lnJ2 = lnJ * lnJ;
  const lnJ3 = lnJ2 * lnJ;
  const lnJ4 = lnJ3 * lnJ;
  const lnJ5 = lnJ4 * lnJ;
  const numerator =
    GSDF_COEFFICIENTS.a +
    GSDF_COEFFICIENTS.c * lnJ +
    GSDF_COEFFICIENTS.e * lnJ2 +
    GSDF_COEFFICIENTS.g * lnJ3 +
    GSDF_COEFFICIENTS.m * lnJ4;
  const denominator =
    1 +
    GSDF_COEFFICIENTS.b * lnJ +
    GSDF_COEFFICIENTS.d * lnJ2 +
    GSDF_COEFFICIENTS.f * lnJ3 +
    GSDF_COEFFICIENTS.h * lnJ4 +
    GSDF_COEFFICIENTS.k * lnJ5;

  return Math.pow(10, numerator / denominator);
}

function luminanceToGsdfJnd(luminance) {
  const target = clampNumber(luminance, GSDF_DISPLAY_LMIN_NITS, 4000, GSDF_DISPLAY_LMIN_NITS);
  let low = GSDF_JND_MIN;
  let high = GSDF_JND_MAX;

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const mid = (low + high) / 2;
    if (gsdfJndToLuminance(mid) < target) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

function getGsdfDisplayCode(inputLevel, lmax, displayGamma = DEFAULT_GAMMA_TARGET) {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const maxLuminance = clampLuminance(lmax);
  const deviceGamma = normalizeDisplayGamma(displayGamma);
  const minLuminance = Math.min(GSDF_DISPLAY_LMIN_NITS, maxLuminance * 0.01);
  const jndMin = luminanceToGsdfJnd(minLuminance);
  const jndMax = luminanceToGsdfJnd(maxLuminance);
  const jnd = jndMin + normalized * (jndMax - jndMin);
  const luminance = gsdfJndToLuminance(jnd);
  const linearDisplayLevel = clampNumber(
    (luminance - minLuminance) / Math.max(0.0001, maxLuminance - minLuminance),
    0,
    1,
    normalized
  );

  return clampNumber(Math.pow(linearDisplayLevel, 1 / deviceGamma), 0, 1, normalized);
}

function getGammaAdjustedInputLevel(inputLevel, gammaTarget, displayGamma) {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const targetGamma = normalizeGammaTarget(gammaTarget);
  const deviceGamma = normalizeDisplayGamma(displayGamma);
  const exponent = targetGamma / deviceGamma;

  return clampNumber(Math.pow(normalized, exponent), 0, 1, normalized);
}

function buildGsdfTableValues(settings = currentSettings, tableSize = GSDF_TABLE_SIZE) {
  const normalized = normalizeSettings(settings);
  const filterAmount = normalized.strength / 100;

  return Array.from({ length: tableSize }, (_, index) => {
    const inputLevel = index / Math.max(1, tableSize - 1);
    const baselineLevel = getGammaAdjustedInputLevel(
      inputLevel,
      normalized.gammaTarget,
      normalized.displayGamma
    );
    const gsdfLevel = getGsdfDisplayCode(baselineLevel, normalized.lmax, normalized.displayGamma);
    const mixedLevel = baselineLevel + (gsdfLevel - baselineLevel) * filterAmount;

    return Number(clampNumber(mixedLevel, 0, 1, inputLevel).toFixed(5));
  });
}

function normalizeSettings(settings = {}) {
  const lmax = clampLuminance(settings.lmax);
  const recommendedImageSettings = getRecommendedImageDefaults(lmax);
  const fallbackFineSharpness = clampNumber(settings.sharpness, 0, 50, DEFAULT_SETTINGS.fineSharpness);
  const usesLegacyImageSchema = !hasNewImageControlSchema(settings);
  const blackPoint = Math.round(clampNumber(settings.blackPoint, BLACK_CLIP_TONE_MIN, BLACK_CLIP_TONE_MAX, recommendedImageSettings.blackPoint));
  const whitePoint = usesLegacyImageSchema
    ? migrateLegacyWhitePercent(settings.whitePoint, recommendedImageSettings.whitePoint)
    : Math.round(clampNumber(settings.whitePoint, WHITE_CLIP_TONE_MIN, WHITE_CLIP_TONE_MAX, recommendedImageSettings.whitePoint));
  const temperature = usesLegacyImageSchema
    ? migrateLegacyTemperature(settings.temperature)
    : Math.round(clampNumber(settings.temperature, TEMPERATURE_MIN_K, TEMPERATURE_MAX_K, DEFAULT_SETTINGS.temperature));
  const normalized = {
    enabled: settings.enabled === true,
    lmax,
    curveMode: normalizeCurveMode(settings.curveMode),
    gammaTarget: normalizeGammaTarget(settings.gammaTarget),
    displayGamma: normalizeDisplayGamma(settings.displayGamma),
    sourceIsLinear: false,
    displayGamut: normalizeDisplayGamut(settings.displayGamut),
    strength: clampNumber(settings.strength, 0, 100, DEFAULT_SETTINGS.strength),
    blackPoint,
    whitePoint,
    fineSharpness: Math.round(clampNumber(settings.fineSharpness, 0, 50, fallbackFineSharpness)),
    mediumSharpness: Math.round(clampNumber(settings.mediumSharpness, 0, 40, DEFAULT_SETTINGS.mediumSharpness)),
    temperature,
    saturation: Math.round(clampNumber(settings.saturation, SATURATION_MIN, SATURATION_MAX, recommendedImageSettings.saturation)),
    grayscale: settings.grayscale === true,
    hue: clampNumber(settings.hue, -30, 30, DEFAULT_SETTINGS.hue)
  };

  if (normalized.whitePoint <= normalized.blackPoint) {
    normalized.whitePoint = Math.min(WHITE_CLIP_TONE_MAX, normalized.blackPoint + 1);
  }

  return normalized;
}

function buildFineSharpenKernel(strength) {
  const amount = clampNumber(strength, 0, 50, 0) / 180;
  return [
    0, -amount, 0,
    -amount, 1 + amount * 4, -amount,
    0, -amount, 0
  ];
}

function buildMediumSharpenKernel(strength) {
  const amount = clampNumber(strength, 0, 40, 0) / 250;
  return [
    0, 0, -amount, 0, 0,
    0, -amount, 0, -amount, 0,
    -amount, 0, 1 + amount * 8, 0, -amount,
    0, -amount, 0, -amount, 0,
    0, 0, -amount, 0, 0
  ];
}

function getDisplayGamutProfile(displayGamut) {
  return DISPLAY_GAMUT_PROFILES[displayGamut] || DISPLAY_GAMUT_PROFILES.srgb;
}

function formatMatrixValues(values) {
  return values.map((value) => Number(value).toFixed(4)).join(' ');
}

function buildLumaChromaMatrices(displayGamut) {
  const { kr, kg, kb } = getDisplayGamutProfile(displayGamut);
  const cbScale = 2 * (1 - kb);
  const crScale = 2 * (1 - kr);
  const redFromCr = crScale;
  const blueFromCb = cbScale;
  const greenFromCb = -(kb * blueFromCb) / kg;
  const greenFromCr = -(kr * redFromCr) / kg;

  return {
    forward: [
      kr, kg, kb, 0, 0,
      -kr / cbScale, -kg / cbScale, (1 - kb) / cbScale, 0, 0.5,
      (1 - kr) / crScale, -kg / crScale, -kb / crScale, 0, 0.5,
      0, 0, 0, 1, 0
    ],
    inverse: [
      1, 0, redFromCr, 0, -0.5 * redFromCr,
      1, greenFromCb, greenFromCr, 0, -0.5 * (greenFromCb + greenFromCr),
      1, blueFromCb, 0, 0, -0.5 * blueFromCb,
      0, 0, 0, 1, 0
    ]
  };
}

function isNeutralToneProfile(profile) {
  return (
    profile.strength === 0 &&
    profile.gammaTarget === DEFAULT_GAMMA_TARGET &&
    profile.sourceIsLinear === false &&
    profile.displayGamma === DEFAULT_SETTINGS.gammaTarget &&
    profile.blackPoint === 0 &&
    profile.whitePoint === TONE_LEVEL_COUNT &&
    profile.fineSharpness === 0 &&
    profile.mediumSharpness === 0 &&
    profile.temperature === 0 &&
    profile.saturation === 100 &&
    profile.grayscale === false &&
    profile.hue === 0
  );
}

function deriveToneProfile(settings = currentSettings) {
  const normalized = normalizeSettings(settings);
  const blackPoint = normalized.blackPoint / TONE_LEVEL_COUNT;
  const whitePoint = normalized.whitePoint / TONE_LEVEL_COUNT;
  const usableRange = Math.max(0.05, whitePoint - blackPoint);
  const levelSlope = 1 / usableRange;
  const levelIntercept = -blackPoint / usableRange;
  const temperatureRatio = normalized.temperature / TEMPERATURE_MAX_K;
  const redGain = clampNumber(1 + temperatureRatio * 0.14, 0.82, 1.18, 1);
  const greenGain = clampNumber(1 + temperatureRatio * 0.025, 0.94, 1.06, 1);
  const blueGain = clampNumber(1 - temperatureRatio * 0.14, 0.82, 1.18, 1);
  const gsdfTableValues = buildGsdfTableValues(normalized);
  const saturationValue = normalized.grayscale ? 0 : clampNumber(normalized.saturation / 100, 0.5, 1.5, 1);
  const hueValue = clampNumber(normalized.hue, -30, 30, 0);
  const lumaChromaMatrices = buildLumaChromaMatrices(normalized.displayGamut);

  return {
    ...normalized,
    levelSlope,
    levelIntercept,
    temperatureMatrix: [
      redGain, 0, 0, 0, 0,
      0, greenGain, 0, 0, 0,
      0, 0, blueGain, 0, 0,
      0, 0, 0, 1, 0
    ],
    saturationValue,
    hueValue,
    fineSharpenKernel: buildFineSharpenKernel(normalized.fineSharpness),
    mediumSharpenKernel: buildMediumSharpenKernel(normalized.mediumSharpness),
    fineSharpenFilterId: normalized.fineSharpness > 0 ? FILTER_IDS.sharpenFine : '',
    mediumSharpenFilterId: normalized.mediumSharpness > 0 ? FILTER_IDS.sharpenMedium : '',
    gsdfTableValues,
    csdfForwardMatrix: lumaChromaMatrices.forward,
    csdfInverseMatrix: lumaChromaMatrices.inverse
  };
}

function formatFilterUrl(id) {
  return `url("#${id}")`;
}

function stripManagedFilterTokens(filterText = '') {
  const stripped = String(filterText || '')
    .replace(MANAGED_FILTER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped === 'none' ? '' : stripped;
}

function buildManagedFilterChain(existingFilter, profile = deriveToneProfile()) {
  const hostFilter = stripManagedFilterTokens(existingFilter);
  const managedFilters = [
    profile.fineSharpenFilterId ? formatFilterUrl(profile.fineSharpenFilterId) : '',
    profile.mediumSharpenFilterId ? formatFilterUrl(profile.mediumSharpenFilterId) : '',
    formatFilterUrl(FILTER_IDS.csdf),
    formatFilterUrl(FILTER_IDS.levels),
    formatFilterUrl(FILTER_IDS.temperature),
    formatFilterUrl(FILTER_IDS.color)
  ].filter(Boolean);

  return [hostFilter, ...managedFilters].filter(Boolean).join(' ');
}

function injectSVGFilter() {
  if (svgFilterInjected && document.getElementById(FILTER_CONTAINER_ID)) {
    return;
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('id', FILTER_CONTAINER_ID);
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, {
    position: 'absolute',
    width: '0',
    height: '0',
    overflow: 'hidden'
  });

  svg.innerHTML = `
    <defs>
      <filter id="${FILTER_IDS.levels}" color-interpolation-filters="sRGB">
        <feComponentTransfer>
          <feFuncR id="${FILTER_IDS.levels}-r" type="linear" slope="1" intercept="0"></feFuncR>
          <feFuncG id="${FILTER_IDS.levels}-g" type="linear" slope="1" intercept="0"></feFuncG>
          <feFuncB id="${FILTER_IDS.levels}-b" type="linear" slope="1" intercept="0"></feFuncB>
        </feComponentTransfer>
      </filter>
      <filter id="${FILTER_IDS.gamma}" color-interpolation-filters="sRGB">
        <feComponentTransfer>
          <feFuncR id="${FILTER_IDS.gamma}-r" type="table" tableValues="0 1"></feFuncR>
          <feFuncG id="${FILTER_IDS.gamma}-g" type="table" tableValues="0 1"></feFuncG>
          <feFuncB id="${FILTER_IDS.gamma}-b" type="table" tableValues="0 1"></feFuncB>
        </feComponentTransfer>
      </filter>
      <filter id="${FILTER_IDS.csdf}" color-interpolation-filters="sRGB">
        <feColorMatrix
          id="${FILTER_IDS.csdf}-forward"
          type="matrix"
          values="0.2126 0.7152 0.0722 0 0  -0.1146 -0.3854 0.5000 0 0.5  0.5000 -0.4542 -0.0458 0 0.5  0 0 0 1 0"
          result="csdf-ycc"
        ></feColorMatrix>
        <feComponentTransfer in="csdf-ycc" result="csdf-adjusted">
          <feFuncR id="${FILTER_IDS.csdf}-r" type="table" tableValues="0 1"></feFuncR>
          <feFuncG id="${FILTER_IDS.csdf}-g" type="linear" slope="1" intercept="0"></feFuncG>
          <feFuncB id="${FILTER_IDS.csdf}-b" type="linear" slope="1" intercept="0"></feFuncB>
        </feComponentTransfer>
        <feColorMatrix
          id="${FILTER_IDS.csdf}-inverse"
          in="csdf-adjusted"
          type="matrix"
          values="1 0 1.5748 0 -0.7874  1 -0.1873 -0.4681 0 0.3277  1 1.8556 0 0 -0.9278  0 0 0 1 0"
        ></feColorMatrix>
      </filter>
      <filter id="${FILTER_IDS.temperature}" color-interpolation-filters="sRGB">
        <feColorMatrix id="${FILTER_IDS.temperature}-matrix" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix>
      </filter>
      <filter id="${FILTER_IDS.color}" color-interpolation-filters="sRGB">
        <feColorMatrix id="${FILTER_IDS.color}-saturation" type="saturate" values="1"></feColorMatrix>
        <feColorMatrix id="${FILTER_IDS.color}-hue" type="hueRotate" values="0"></feColorMatrix>
      </filter>
      <filter id="${FILTER_IDS.sharpenFine}">
        <feConvolveMatrix id="${FILTER_IDS.sharpenFine}-kernel" order="3" preserveAlpha="true" kernelMatrix="0 0 0 0 1 0 0 0 0"></feConvolveMatrix>
      </filter>
      <filter id="${FILTER_IDS.sharpenMedium}">
        <feConvolveMatrix id="${FILTER_IDS.sharpenMedium}-kernel" order="5" preserveAlpha="true" kernelMatrix="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0"></feConvolveMatrix>
      </filter>
    </defs>
  `;

  document.documentElement.appendChild(svg);
  svgFilterInjected = true;
}

function setTransferAttributes(filterId, attributes) {
  ['r', 'g', 'b'].forEach((channel) => {
    const element = document.getElementById(`${filterId}-${channel}`);
    if (!element) {
      return;
    }

    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, String(value));
    });
  });
}

function setElementAttributes(id, attributes) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  Object.entries(attributes).forEach(([name, value]) => {
    element.setAttribute(name, String(value));
  });
}

function updateFilterDefinitions(profile) {
  injectSVGFilter();
  setTransferAttributes(FILTER_IDS.gamma, {
    tableValues: profile.gsdfTableValues.join(' ')
  });
  setElementAttributes(`${FILTER_IDS.csdf}-r`, {
    tableValues: profile.gsdfTableValues.join(' ')
  });
  setTransferAttributes(FILTER_IDS.levels, {
    slope: profile.levelSlope.toFixed(4),
    intercept: profile.levelIntercept.toFixed(4)
  });

  const temperatureMatrix = document.getElementById(`${FILTER_IDS.temperature}-matrix`);
  if (temperatureMatrix) {
    temperatureMatrix.setAttribute(
      'values',
      profile.temperatureMatrix.map((value) => Number(value).toFixed(4)).join(' ')
    );
  }

  const csdfForwardMatrix = document.getElementById(`${FILTER_IDS.csdf}-forward`);
  if (csdfForwardMatrix) {
    csdfForwardMatrix.setAttribute('values', formatMatrixValues(profile.csdfForwardMatrix));
  }

  const csdfInverseMatrix = document.getElementById(`${FILTER_IDS.csdf}-inverse`);
  if (csdfInverseMatrix) {
    csdfInverseMatrix.setAttribute('values', formatMatrixValues(profile.csdfInverseMatrix));
  }

  const saturationMatrix = document.getElementById(`${FILTER_IDS.color}-saturation`);
  if (saturationMatrix) {
    saturationMatrix.setAttribute('values', profile.saturationValue.toFixed(3));
  }

  const fineSharpenKernel = document.getElementById(`${FILTER_IDS.sharpenFine}-kernel`);
  if (fineSharpenKernel) {
    fineSharpenKernel.setAttribute('kernelMatrix', formatMatrixValues(profile.fineSharpenKernel));
  }

  const mediumSharpenKernel = document.getElementById(`${FILTER_IDS.sharpenMedium}-kernel`);
  if (mediumSharpenKernel) {
    mediumSharpenKernel.setAttribute('kernelMatrix', formatMatrixValues(profile.mediumSharpenKernel));
  }

  const hueMatrix = document.getElementById(`${FILTER_IDS.color}-hue`);
  if (hueMatrix) {
    hueMatrix.setAttribute('values', profile.hueValue.toFixed(1));
  }
}

function rememberOriginalVideoStyle(video) {
  if (!video || originalVideoStyles.has(video)) {
    return;
  }

  originalVideoStyles.set(video, {
    filter: video.style.filter,
    transition: video.style.transition,
    willChange: video.style.willChange
  });
}

function restoreVideoStyle(video) {
  const original = originalVideoStyles.get(video);
  if (!video || !original) {
    return;
  }

  video.style.filter = original.filter;
  video.style.transition = original.transition;
  video.style.willChange = original.willChange;
}

function getElementArea(rect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function getViewportOverlapRatio(rect, viewport) {
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const left = Math.max(0, rect.left);
  const right = Math.min(viewportWidth, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(viewportHeight, rect.bottom);
  const overlapWidth = Math.max(0, right - left);
  const overlapHeight = Math.max(0, bottom - top);
  const area = getElementArea(rect);

  return area === 0 ? 0 : (overlapWidth * overlapHeight) / area;
}

function getCenterDistanceRatio(rect, viewport) {
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;
  const videoCenterX = rect.left + rect.width / 2;
  const videoCenterY = rect.top + rect.height / 2;
  const distance = Math.hypot(videoCenterX - viewportCenterX, videoCenterY - viewportCenterY);
  const maxDistance = Math.hypot(viewportCenterX, viewportCenterY);

  return maxDistance === 0 ? 0 : distance / maxDistance;
}

function isRendered(video, getComputedStyleFn = window.getComputedStyle) {
  if (!video?.isConnected) {
    return false;
  }

  const style = getComputedStyleFn(video);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || 1) > 0.05
  );
}

function getYouTubePageKind(locationLike = window.location) {
  if (locationLike.pathname?.startsWith('/watch')) {
    return 'watch';
  }

  if (locationLike.pathname?.startsWith('/shorts')) {
    return 'shorts';
  }

  return 'other';
}

function getYouTubeCandidate(video, options = {}) {
  const rect = video.getBoundingClientRect();
  const getComputedStyleFn = options.getComputedStyle ?? window.getComputedStyle;
  const viewport = options.viewport;

  return {
    video,
    visibleArea: isRendered(video, getComputedStyleFn) ? getElementArea(rect) : 0,
    viewportRatio: getViewportOverlapRatio(rect, viewport),
    centerDistanceRatio: getCenterDistanceRatio(rect, viewport),
    readyState: video.readyState || 0,
    hasVideoDimensions: (video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0,
    paused: video.paused === true,
    ended: video.ended === true,
    currentTime: Number(video.currentTime || 0),
    muted: video.muted === true,
    youtubeMainPlayer: Boolean(video.closest?.('#movie_player, .html5-video-player')),
    youtubeShortsPlayer: Boolean(video.closest?.('ytd-reel-video-renderer, ytd-shorts')),
    youtubeMiniPlayer: Boolean(video.closest?.('ytd-miniplayer')),
    youtubePreview: Boolean(
      video.closest?.('ytd-rich-grid-media, ytd-video-preview, ytd-thumbnail, ytd-compact-video-renderer')
    )
  };
}

function scorePlayback(candidate) {
  if (candidate.ended) {
    return -2_000_000;
  }

  return (candidate.paused ? 0 : 2_000_000) + candidate.readyState * 50_000;
}

function scoreYouTubePlacement(candidate, pageKind) {
  const mainPlayerBoost = pageKind === 'watch' && candidate.youtubeMainPlayer ? 6_000_000 : 0;
  const shortsBoost = pageKind === 'shorts' && candidate.youtubeShortsPlayer ? 6_000_000 : 0;
  const miniPlayerPenalty = candidate.youtubeMiniPlayer ? 3_000_000 : 0;
  const previewPenalty = candidate.youtubePreview && candidate.paused ? 1_500_000 : 0;
  const mutedPreviewPenalty = candidate.youtubePreview && candidate.muted ? 1_500_000 : 0;
  const centerPenalty = candidate.centerDistanceRatio * 300_000;

  return (
    mainPlayerBoost +
    shortsBoost -
    miniPlayerPenalty -
    previewPenalty -
    mutedPreviewPenalty -
    centerPenalty
  );
}

function scoreYouTubeVideoCandidate(candidate, pageKind) {
  if (
    !candidate.hasVideoDimensions ||
    candidate.viewportRatio <= 0 ||
    candidate.visibleArea < MIN_VISIBLE_AREA
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  return candidate.visibleArea * candidate.viewportRatio + scorePlayback(candidate) + scoreYouTubePlacement(candidate, pageKind);
}

function scoreGenericVideo(video, options = {}) {
  if (!isRendered(video, options.getComputedStyle ?? window.getComputedStyle)) {
    return Number.NEGATIVE_INFINITY;
  }

  const rect = video.getBoundingClientRect();
  const visibleArea = getElementArea(rect) * getViewportOverlapRatio(rect, options.viewport);
  if (visibleArea < MIN_VISIBLE_AREA) {
    return Number.NEGATIVE_INFINITY;
  }

  const decodedPixels = Math.max(0, Number(video.videoWidth || 0)) * Math.max(0, Number(video.videoHeight || 0));
  const playbackBoost = !video.paused && !video.ended ? 2_000_000 : 0;

  return visibleArea + decodedPixels * 0.08 + playbackBoost + Number(video.readyState || 0) * 50_000;
}

function selectTargetVideos(videos, options = {}) {
  const locationLike = options.location ?? window.location;
  const hostname = String(locationLike.hostname || '');

  if (/(^|\.)youtube\.com$/.test(hostname)) {
    const pageKind = getYouTubePageKind(locationLike);
    const ranked = videos
      .map((video) => ({
        video,
        score: scoreYouTubeVideoCandidate(getYouTubeCandidate(video, options), pageKind)
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((left, right) => right.score - left.score);

    return ranked.slice(0, 1).map((entry) => entry.video);
  }

  return videos
    .map((video) => ({
      video,
      score: scoreGenericVideo(video, options)
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry) => entry.video);
}

function discoverVideos(root = document) {
  const videos = Array.from(root.querySelectorAll('video')).filter((video) => {
    return typeof HTMLVideoElement === 'undefined' || video instanceof HTMLVideoElement;
  });
  const elements = [
    root instanceof Element ? root : null,
    ...Array.from(root.querySelectorAll('*'))
  ].filter(Boolean);

  elements.forEach((element) => {
    if (element.shadowRoot) {
      videos.push(...discoverVideos(element.shadowRoot));
    }
  });

  return videos;
}

function applyVideoFilter(video, profile) {
  rememberOriginalVideoStyle(video);
  const original = originalVideoStyles.get(video);
  video.style.filter = buildManagedFilterChain(original?.filter || '', profile);
  video.style.transition = original?.transition || 'filter 160ms ease';
  video.style.willChange = original?.willChange || 'filter';
}

function updateVideoFilters() {
  const settings = normalizeSettings(currentSettings);

  if (!settings.enabled) {
    managedVideos.forEach((video) => restoreVideoStyle(video));
    managedVideos.clear();
    return;
  }

  const videos = discoverVideos();
  const targetVideos = selectTargetVideos(videos);
  const targetSet = new Set(targetVideos);
  const profile = deriveToneProfile(settings);

  if (isNeutralToneProfile(profile)) {
    managedVideos.forEach((video) => restoreVideoStyle(video));
    managedVideos.clear();
    return;
  }

  updateFilterDefinitions(profile);

  managedVideos.forEach((video) => {
    if (!video.isConnected || !targetSet.has(video)) {
      restoreVideoStyle(video);
      managedVideos.delete(video);
    }
  });

  targetVideos.forEach((video) => {
    applyVideoFilter(video, profile);
    managedVideos.add(video);
  });
}

function scheduleVideoFilterUpdate(delayMs = 80) {
  if (scanTimer !== null) {
    window.clearTimeout(scanTimer);
  }

  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    updateVideoFilters();
  }, delayMs);
}

function startVideoObservers() {
  if (mutationObserver) {
    return;
  }

  mutationObserver = new MutationObserver(() => {
    if (currentSettings.enabled) {
      scheduleVideoFilterUpdate();
    }
  });
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  ['fullscreenchange', 'resize', 'scroll'].forEach((eventName) => {
    window.addEventListener(eventName, () => {
      if (currentSettings.enabled) {
        scheduleVideoFilterUpdate(0);
      }
    }, true);
  });
}

function getViewportFrame() {
  const viewportWidth = Math.max(1, Number(window.innerWidth || PANEL_DEFAULT_WIDTH));
  const viewportHeight = Math.max(1, Number(window.innerHeight || PANEL_DEFAULT_MAX_HEIGHT));

  return { viewportWidth, viewportHeight };
}

function clampPanelPatternFrame(frame) {
  const { viewportWidth, viewportHeight } = getViewportFrame();
  const maxWidth = Math.max(PANEL_PATTERN_MIN_WIDTH, viewportWidth - PANEL_PATTERN_MARGIN * 2);
  const maxHeight = Math.max(PANEL_PATTERN_MIN_HEIGHT, viewportHeight - PANEL_PATTERN_MARGIN * 2);
  const width = clampNumber(frame.width, PANEL_PATTERN_MIN_WIDTH, maxWidth, PANEL_PATTERN_DEFAULT_WIDTH);
  const height = clampNumber(frame.height, PANEL_PATTERN_MIN_HEIGHT, maxHeight, PANEL_PATTERN_DEFAULT_HEIGHT);
  const maxX = Math.max(0, viewportWidth - width);
  const maxY = Math.max(0, viewportHeight - height);

  return {
    width,
    height,
    x: clampNumber(frame.x, 0, maxX, PANEL_PATTERN_MARGIN),
    y: clampNumber(frame.y, 0, maxY, PANEL_PATTERN_MARGIN)
  };
}

function getDefaultPanelPatternFrame() {
  const { viewportWidth, viewportHeight } = getViewportFrame();
  return clampPanelPatternFrame({
    x: PANEL_PATTERN_MARGIN,
    y: PANEL_PATTERN_MARGIN,
    width: Math.min(PANEL_PATTERN_DEFAULT_WIDTH, viewportWidth - PANEL_PATTERN_MARGIN * 2),
    height: Math.min(PANEL_PATTERN_DEFAULT_HEIGHT, viewportHeight - PANEL_PATTERN_MARGIN * 2)
  });
}

function ensurePanelPatternFrame() {
  panelPatternFrame = clampPanelPatternFrame(panelPatternFrame ?? getDefaultPanelPatternFrame());
  return panelPatternFrame;
}

function getDefaultPanelFrameSize() {
  return {
    width: PANEL_DEFAULT_WIDTH,
    height: PANEL_DEFAULT_MAX_HEIGHT
  };
}

function clampPanelFrameSize(size) {
  const { viewportWidth, viewportHeight } = getViewportFrame();
  const maxWidth = Math.max(1, viewportWidth - PANEL_VIEWPORT_MARGIN);
  const maxHeight = Math.max(1, viewportHeight - PANEL_VIEWPORT_MARGIN);
  const minWidth = Math.min(PANEL_DEFAULT_MIN_WIDTH, maxWidth);
  const minHeight = Math.min(PANEL_DEFAULT_MIN_HEIGHT, maxHeight);

  return {
    width: clampNumber(size.width, minWidth, maxWidth, PANEL_DEFAULT_WIDTH),
    height: clampNumber(size.height, minHeight, maxHeight, PANEL_DEFAULT_MAX_HEIGHT)
  };
}

function getPanelFrameSize(expanded = panelExpandedForPattern) {
  if (expanded) {
    const patternFrame = ensurePanelPatternFrame();
    return { width: patternFrame.width, height: patternFrame.height };
  }

  return clampPanelFrameSize(panelFrameSize ?? getDefaultPanelFrameSize());
}

function applyPanelFrameLayout() {
  if (!uiIframe) {
    return;
  }

  const { width, height } = getPanelFrameSize();
  const maxX = Math.max(0, Number(window.innerWidth || width) - width);
  const maxY = Math.max(0, Number(window.innerHeight || height) - height);
  if (panelExpandedForPattern) {
    const patternFrame = ensurePanelPatternFrame();
    uiIframe.style.width = `${width}px`;
    uiIframe.style.height = `${height}px`;
    uiIframe.style.left = `${patternFrame.x}px`;
    uiIframe.style.top = `${patternFrame.y}px`;
    uiIframe.style.transform = '';
    return;
  }

  panelPosition = {
    x: Math.min(Math.max(0, panelPosition.x), maxX),
    y: Math.min(Math.max(0, panelPosition.y), maxY),
  };
  uiIframe.style.width = `${width}px`;
  uiIframe.style.height = `${height}px`;
  uiIframe.style.left = `${panelPosition.x}px`;
  uiIframe.style.top = `${panelPosition.y}px`;
  uiIframe.style.transform = '';
}

function applyPanelDrag(deltaX, deltaY) {
  if (!uiIframe) {
    return;
  }

  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) {
    return;
  }

  const { width, height } = getPanelFrameSize();
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  if (panelExpandedForPattern) {
    const patternFrame = ensurePanelPatternFrame();
    panelPatternFrame = clampPanelPatternFrame({
      ...patternFrame,
      x: patternFrame.x + deltaX,
      y: patternFrame.y + deltaY
    });
    applyPanelFrameLayout();
    return;
  }

  panelPosition = {
    x: Math.min(Math.max(0, panelPosition.x + deltaX), maxX),
    y: Math.min(Math.max(0, panelPosition.y + deltaY), maxY),
  };
  uiIframe.style.left = `${panelPosition.x}px`;
  uiIframe.style.top = `${panelPosition.y}px`;
  uiIframe.style.transform = '';
}

function schedulePanelDrag(deltaX, deltaY) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) {
    return;
  }

  pendingPanelDrag = {
    deltaX: (pendingPanelDrag?.deltaX ?? 0) + deltaX,
    deltaY: (pendingPanelDrag?.deltaY ?? 0) + deltaY
  };

  if (pendingPanelDragFrame) {
    return;
  }

  pendingPanelDragFrame = scheduleAnimationFrame(() => {
    const drag = pendingPanelDrag;
    pendingPanelDrag = null;
    pendingPanelDragFrame = 0;
    if (drag) {
      applyPanelDrag(drag.deltaX, drag.deltaY);
    }
  });
}

function applyPanelResize(deltaWidth, deltaHeight) {
  if (!uiIframe) {
    return;
  }

  if (!Number.isFinite(deltaWidth) || !Number.isFinite(deltaHeight) || (deltaWidth === 0 && deltaHeight === 0)) {
    return;
  }

  if (!panelExpandedForPattern) {
    const currentSize = getPanelFrameSize(false);
    panelFrameSize = clampPanelFrameSize({
      width: currentSize.width + deltaWidth,
      height: currentSize.height + deltaHeight
    });
    applyPanelFrameLayout();
    return;
  }

  const patternFrame = ensurePanelPatternFrame();
  panelPatternFrame = clampPanelPatternFrame({
    ...patternFrame,
    width: patternFrame.width + deltaWidth,
    height: patternFrame.height + deltaHeight
  });
  applyPanelFrameLayout();
}

function applyPanelLayoutRequest(width, height) {
  if (!uiIframe || panelExpandedForPattern) {
    return;
  }

  panelFrameSize = clampPanelFrameSize({
    width,
    height
  });
  applyPanelFrameLayout();
}

function closeUI() {
  if (!uiIframe) {
    return;
  }

  uiIframe.style.display = 'none';
}

function toggleUI() {
  if (uiIframe) {
    uiIframe.style.display = uiIframe.style.display === 'none' ? 'block' : 'none';
    if (uiIframe.style.display !== 'none') {
      applyPanelFrameLayout();
    }
    return;
  }

  injectSVGFilter();
  startVideoObservers();

  uiIframe = document.createElement('iframe');
  uiIframe.src = chrome.runtime.getURL('ui/index.html?mode=extension');
  uiIframe.id = 'gsdf-eotf-ui-iframe';
  uiIframe.allow = 'camera';
  
  Object.assign(uiIframe.style, {
    position: 'fixed',
    top: `${panelPosition.y}px`,
    left: `${panelPosition.x}px`,
    border: 'none',
    zIndex: '2147483647',
    backgroundColor: 'transparent',
    pointerEvents: 'auto',
    display: 'block',
    colorScheme: 'normal',
    overflow: 'hidden',
    transform: '',
    willChange: 'left, top, width, height'
  });

  document.body.appendChild(uiIframe);
  applyPanelFrameLayout();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggle_ui') {
    toggleUI();
    sendResponse({ status: 'ok' });
  }
});

window.addEventListener('message', (event) => {
  if (!uiIframe || event.source !== uiIframe.contentWindow) {
    return;
  }

  if (event.data && event.data.type === 'GSDF_SETTINGS_CHANGED') {
    currentSettings = normalizeSettings(event.data.payload);
    startVideoObservers();
    updateVideoFilters();
    return;
  }

  if (event.data && event.data.type === 'GSDF_PANEL_DRAGGED' && uiIframe) {
    const { deltaX, deltaY } = event.data.payload;
    schedulePanelDrag(deltaX, deltaY);
  }

  if (event.data && event.data.type === 'GSDF_PANEL_RESIZED' && uiIframe) {
    const { deltaWidth, deltaHeight } = event.data.payload;
    applyPanelResize(deltaWidth, deltaHeight);
  }

  if (event.data && event.data.type === 'GSDF_PANEL_LAYOUT_REQUEST' && uiIframe) {
    const { width, height } = event.data.payload || {};
    applyPanelLayoutRequest(width, height);
  }

  if (event.data && event.data.type === 'GSDF_CLOSE_PANEL') {
    closeUI();
  }

  if (event.data && event.data.type === 'GSDF_PATTERN_VIEW_CHANGED') {
    panelExpandedForPattern = event.data.payload?.open === true;
    if (panelExpandedForPattern) {
      ensurePanelPatternFrame();
    }
    applyPanelFrameLayout();
  }
});

setInterval(() => {
  if (currentSettings.enabled) {
    updateVideoFilters();
  }
}, 2000);

globalThis.__GSDF_EOTF_CONTENT__ = {
  status: 'ready',
  toggleUI,
  closeUI,
  updateVideoFilters,
  getState() {
    return {
      enabled: currentSettings.enabled,
      panelVisible: Boolean(uiIframe && uiIframe.style.display !== 'none'),
      managedVideoCount: managedVideos.size
    };
  }
};

if (window.__GSDF_EOTF_TEST__) {
  window.__gsdfEotfTestHooks = {
    buildManagedFilterChain,
    buildGsdfTableValues,
    deriveToneProfile,
    gammaCorrectionToTarget,
    gammaTargetToCorrection,
    getGammaAdjustedInputLevel,
    getRecommendedImageDefaults,
    gsdfJndToLuminance,
    luminanceToSliderValue,
    luminanceToGsdfJnd,
    normalizeSettings,
    selectTargetVideos,
    sliderValueToLuminance,
    scoreYouTubeVideoCandidate
  };
}
})();
