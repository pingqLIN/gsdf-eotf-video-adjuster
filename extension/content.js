// This content script injects the React UI iframe and applies managed video filters.
(() => {
const existingContentApi = globalThis.__GSDF_EOTF_CONTENT__;
if (existingContentApi?.status === 'ready') {
  return;
}
globalThis.__GSDF_EOTF_CONTENT__ = { status: 'loading' };

const DEFAULT_SETTINGS = {
  enabled: false,
  lmax: 350,
  curveMode: 'relative',
  gammaTarget: 2.2,
  colorModel: 'rgb',
  strength: 80,
  blackPoint: 0,
  whitePoint: 100,
  sharpness: 0,
  temperature: 0
};

const LUMINANCE_MIN_NITS = 10;
const LUMINANCE_MAX_NITS = 500;
const LUMINANCE_SLIDER_MAX = 1000;
const GAMMA_TARGET_MIN = 1.0;
const GAMMA_TARGET_MAX = 3.0;
const DEFAULT_GAMMA_TARGET = 2.2;
const GAMMA_CORRECTION_MIN = -100;
const GAMMA_CORRECTION_MAX = 100;
const LUMINANCE_LOG_RANGE = Math.log(LUMINANCE_MAX_NITS / LUMINANCE_MIN_NITS);
const GSDF_DISPLAY_LMIN_NITS = 0.05;
const GSDF_JND_MIN = 1;
const GSDF_JND_MAX = 1023;
const GSDF_TABLE_SIZE = 256;
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
  ycbcr: 'gsdf-eotf-ycbcr',
  levels: 'gsdf-eotf-levels',
  temperature: 'gsdf-eotf-temp',
  sharpen1: 'gsdf-eotf-sharpen-1',
  sharpen2: 'gsdf-eotf-sharpen-2',
  sharpen3: 'gsdf-eotf-sharpen-3'
};
const MANAGED_FILTER_RE =
  /\s*url\((["']?)#gsdf-eotf-(?:gamma|ycbcr|levels|temp|sharpen-[123])\1\)\s*/g;
const MIN_VISIBLE_AREA = 8000;
const PANEL_VIEWPORT_MARGIN = 16;
const PANEL_DEFAULT_WIDTH = 420;
const PANEL_DEFAULT_MAX_HEIGHT = 720;
const PANEL_PATTERN_MARGIN = 8;

let uiIframe = null;
let svgFilterInjected = false;
let currentSettings = { ...DEFAULT_SETTINGS };
let panelPosition = { x: 24, y: 24 };
let panelExpandedForPattern = false;
let scanTimer = null;
let mutationObserver = null;
const managedVideos = new Set();
const originalVideoStyles = new WeakMap();

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

function normalizeCurveMode(_value) {
  return DEFAULT_SETTINGS.curveMode;
}

function normalizeColorModel(value) {
  return value === 'ycbcr' ? 'ycbcr' : DEFAULT_SETTINGS.colorModel;
}

function normalizeGammaTarget(value) {
  return Number(clampNumber(value, GAMMA_TARGET_MIN, GAMMA_TARGET_MAX, DEFAULT_SETTINGS.gammaTarget).toFixed(3));
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

function getGsdfDisplayCode(inputLevel, lmax) {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const maxLuminance = clampLuminance(lmax);
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

  return clampNumber(Math.pow(linearDisplayLevel, 1 / 2.2), 0, 1, normalized);
}

function getGammaAdjustedInputLevel(inputLevel, gammaTarget) {
  const normalized = clampNumber(inputLevel, 0, 1, 0);
  const targetGamma = normalizeGammaTarget(gammaTarget);
  const exponent = targetGamma / DEFAULT_GAMMA_TARGET;

  return clampNumber(Math.pow(normalized, exponent), 0, 1, normalized);
}

function buildGsdfTableValues(settings = currentSettings, tableSize = GSDF_TABLE_SIZE) {
  const normalized = normalizeSettings(settings);
  const filterAmount = normalized.strength / 100;

  return Array.from({ length: tableSize }, (_, index) => {
    const inputLevel = index / Math.max(1, tableSize - 1);
    const gammaLevel = getGammaAdjustedInputLevel(inputLevel, normalized.gammaTarget);
    const gsdfLevel = getGsdfDisplayCode(gammaLevel, normalized.lmax);
    const mixedLevel = gammaLevel + (gsdfLevel - gammaLevel) * filterAmount;

    return Number(clampNumber(mixedLevel, 0, 1, inputLevel).toFixed(5));
  });
}

function normalizeSettings(settings = {}) {
  const normalized = {
    enabled: settings.enabled === true,
    lmax: clampLuminance(settings.lmax),
    curveMode: normalizeCurveMode(settings.curveMode),
    gammaTarget: normalizeGammaTarget(settings.gammaTarget),
    colorModel: normalizeColorModel(settings.colorModel),
    strength: clampNumber(settings.strength, 0, 100, DEFAULT_SETTINGS.strength),
    blackPoint: clampNumber(settings.blackPoint, 0, 20, DEFAULT_SETTINGS.blackPoint),
    whitePoint: clampNumber(settings.whitePoint, 80, 100, DEFAULT_SETTINGS.whitePoint),
    sharpness: clampNumber(settings.sharpness, 0, 100, DEFAULT_SETTINGS.sharpness),
    temperature: clampNumber(settings.temperature, -50, 50, DEFAULT_SETTINGS.temperature)
  };

  if (normalized.whitePoint <= normalized.blackPoint + 10) {
    normalized.whitePoint = Math.min(100, normalized.blackPoint + 10);
  }

  return normalized;
}

function getSharpnessFilterId(sharpness) {
  if (sharpness < 15) return '';
  if (sharpness < 35) return FILTER_IDS.sharpen1;
  if (sharpness < 65) return FILTER_IDS.sharpen2;
  return FILTER_IDS.sharpen3;
}

function deriveToneProfile(settings = currentSettings) {
  const normalized = normalizeSettings(settings);
  const blackPoint = normalized.blackPoint / 100;
  const whitePoint = normalized.whitePoint / 100;
  const usableRange = Math.max(0.05, whitePoint - blackPoint);
  const levelSlope = 1 / usableRange;
  const levelIntercept = -blackPoint / usableRange;
  const temperatureRatio = normalized.temperature / 50;
  const redGain = clampNumber(1 + temperatureRatio * 0.16, 0.78, 1.22, 1);
  const greenGain = clampNumber(1 + temperatureRatio * 0.035, 0.92, 1.08, 1);
  const blueGain = clampNumber(1 - temperatureRatio * 0.16, 0.78, 1.22, 1);
  const gsdfTableValues = buildGsdfTableValues(normalized);

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
    sharpenFilterId: getSharpnessFilterId(normalized.sharpness),
    gsdfTableValues
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
  const transferFilterId = profile.colorModel === 'ycbcr' ? FILTER_IDS.ycbcr : FILTER_IDS.gamma;
  const managedFilters = [
    profile.sharpenFilterId ? formatFilterUrl(profile.sharpenFilterId) : '',
    formatFilterUrl(FILTER_IDS.levels),
    formatFilterUrl(transferFilterId),
    formatFilterUrl(FILTER_IDS.temperature)
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
      <filter id="${FILTER_IDS.ycbcr}" color-interpolation-filters="sRGB">
        <feColorMatrix
          type="matrix"
          values="0.2126 0.7152 0.0722 0 0  -0.1146 -0.3854 0.5000 0 0.5  0.5000 -0.4542 -0.0458 0 0.5  0 0 0 1 0"
          result="ycbcr"
        ></feColorMatrix>
        <feComponentTransfer in="ycbcr" result="yAdjusted">
          <feFuncR id="${FILTER_IDS.ycbcr}-r" type="table" tableValues="0 1"></feFuncR>
          <feFuncG id="${FILTER_IDS.ycbcr}-g" type="linear" slope="1" intercept="0"></feFuncG>
          <feFuncB id="${FILTER_IDS.ycbcr}-b" type="linear" slope="1" intercept="0"></feFuncB>
        </feComponentTransfer>
        <feColorMatrix
          in="yAdjusted"
          type="matrix"
          values="1 0 1.5748 0 -0.7874  1 -0.1873 -0.4681 0 0.3277  1 1.8556 0 0 -0.9278  0 0 0 1 0"
        ></feColorMatrix>
      </filter>
      <filter id="${FILTER_IDS.temperature}" color-interpolation-filters="sRGB">
        <feColorMatrix id="${FILTER_IDS.temperature}-matrix" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"></feColorMatrix>
      </filter>
      <filter id="${FILTER_IDS.sharpen1}">
        <feConvolveMatrix order="3" kernelMatrix="0 -0.22 0 -0.22 1.88 -0.22 0 -0.22 0"></feConvolveMatrix>
      </filter>
      <filter id="${FILTER_IDS.sharpen2}">
        <feConvolveMatrix order="3" kernelMatrix="0 -0.38 0 -0.38 2.52 -0.38 0 -0.38 0"></feConvolveMatrix>
      </filter>
      <filter id="${FILTER_IDS.sharpen3}">
        <feConvolveMatrix order="3" kernelMatrix="0 -0.55 0 -0.55 3.20 -0.55 0 -0.55 0"></feConvolveMatrix>
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

function updateFilterDefinitions(profile) {
  injectSVGFilter();
  setTransferAttributes(FILTER_IDS.gamma, {
    tableValues: profile.gsdfTableValues.join(' ')
  });
  setTransferAttributes(FILTER_IDS.ycbcr, {
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

function getPanelFrameSize(expanded = panelExpandedForPattern) {
  const viewportWidth = Math.max(PANEL_DEFAULT_WIDTH, Number(window.innerWidth || PANEL_DEFAULT_WIDTH));
  const viewportHeight = Math.max(PANEL_DEFAULT_MAX_HEIGHT, Number(window.innerHeight || PANEL_DEFAULT_MAX_HEIGHT));
  if (expanded) {
    return {
      width: Math.max(PANEL_DEFAULT_WIDTH, viewportWidth - PANEL_PATTERN_MARGIN * 2),
      height: Math.max(320, viewportHeight - PANEL_PATTERN_MARGIN * 2)
    };
  }

  const width = Math.min(
    PANEL_DEFAULT_WIDTH,
    Math.max(PANEL_DEFAULT_WIDTH, viewportWidth - PANEL_VIEWPORT_MARGIN)
  );
  const height = Math.min(
    PANEL_DEFAULT_MAX_HEIGHT,
    Math.max(320, viewportHeight - PANEL_VIEWPORT_MARGIN)
  );

  return { width, height };
}

function applyPanelFrameLayout() {
  if (!uiIframe) {
    return;
  }

  const { width, height } = getPanelFrameSize();
  const maxX = Math.max(0, Number(window.innerWidth || width) - width);
  const maxY = Math.max(0, Number(window.innerHeight || height) - height);
  if (panelExpandedForPattern) {
    uiIframe.style.width = `${width}px`;
    uiIframe.style.height = `${height}px`;
    uiIframe.style.left = `${Math.min(PANEL_PATTERN_MARGIN, maxX)}px`;
    uiIframe.style.top = `${Math.min(PANEL_PATTERN_MARGIN, maxY)}px`;
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
}

function applyPanelDrag(deltaX, deltaY) {
  if (!uiIframe) {
    return;
  }

  const { width, height } = getPanelFrameSize();
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);
  panelPosition = {
    x: Math.min(Math.max(0, panelPosition.x + deltaX), maxX),
    y: Math.min(Math.max(0, panelPosition.y + deltaY), maxY),
  };
  uiIframe.style.left = `${panelPosition.x}px`;
  uiIframe.style.top = `${panelPosition.y}px`;
}

function schedulePanelDrag(deltaX, deltaY) {
  applyPanelDrag(deltaX, deltaY);
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
    overflow: 'hidden'
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

  if (event.data && event.data.type === 'GSDF_CLOSE_PANEL') {
    closeUI();
  }

  if (event.data && event.data.type === 'GSDF_PATTERN_VIEW_CHANGED') {
    panelExpandedForPattern = event.data.payload?.open === true;
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
