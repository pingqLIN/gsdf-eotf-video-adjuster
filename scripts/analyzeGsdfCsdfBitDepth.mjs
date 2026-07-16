import { Buffer } from 'node:buffer';
import { writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { build as esbuildBuild } from 'esbuild';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const DEFAULT_OUTPUTS = {
  en: 'docs/gsdf-csdf-bit-depth-report.artifact.json',
  'zh-tw': 'docs/gsdf-csdf-bit-depth-report.zh-tw.artifact.json',
};
const MODEL_SETTINGS = {
  lmax: 100,
  gammaTarget: 2.2,
  displayGamma: 2.2,
  displayGamut: 'adobe-rgb',
  strength: 100,
  blackPoint: 0,
  whitePoint: 256,
};
const SNAPSHOT_OPTIONS = {
  tableSize: 256,
  displayPreset: 'ips-1000',
  digits: 5,
};
const GAMMA_MODES = [
  {
    id: 'neutral',
    gammaTarget: 2.2,
    uiCorrection: 0,
  },
  {
    id: 'forced-gamma-1',
    gammaTarget: 1,
    uiCorrection: 100,
  },
];
const FORMULAS = ['Baseline', 'GSDF', 'CSDF'];
const REPRESENTATIONS = [
  { id: 'ideal', bits: null },
  { id: '8-bit', bits: 8 },
  { id: '10-bit', bits: 10 },
];
const INPUT_BANDS = [
  { id: '0-31', start: 0, end: 31 },
  { id: '32-63', start: 32, end: 63 },
  { id: '64-127', start: 64, end: 127 },
  { id: '128-191', start: 128, end: 191 },
  { id: '192-223', start: 192, end: 223 },
  { id: '224-255', start: 224, end: 255 },
];
const SAMPLE_CODES = [0, 1, 2, 4, 8, 16, 32, 64, 96, 128, 160, 192, 224, 240, 255];
const CURVE_CHART_CODES = [...Array.from({ length: 16 }, (_, index) => index * 16), 255];
const JND_CHART_BANDS = Array.from({ length: 16 }, (_, index) => ({
  start: index * 16,
  end: index === 15 ? 255 : (index + 1) * 16,
}));
const DATASET_SQL = {
  summary_metrics: 'SELECT * FROM summary_metrics ORDER BY caseLabel ASC',
  mapping_neutral: 'SELECT * FROM mapping_neutral ORDER BY rowid ASC',
  jnd_gsdf: 'SELECT * FROM jnd_gsdf ORDER BY rowid ASC',
  gamma_sensitivity: 'SELECT * FROM gamma_sensitivity ORDER BY rowid ASC',
  quantization_summary: 'SELECT * FROM quantization_summary ORDER BY caseLabel ASC',
  plateau_bands: 'SELECT * FROM plateau_bands ORDER BY rowid ASC',
  brightness_samples: 'SELECT * FROM brightness_samples ORDER BY inputCode ASC',
  headline_metrics: 'SELECT * FROM headline_metrics ORDER BY rowid ASC',
};

function parseArguments(argv) {
  const options = {
    locale: 'en',
    output: null,
    generatedAt: new Date().toISOString(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === '--locale') {
      options.locale = value;
      index += 1;
    } else if (argument === '--output') {
      options.output = value;
      index += 1;
    } else if (argument === '--generated-at') {
      options.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }

  if (!Object.hasOwn(DEFAULT_OUTPUTS, options.locale)) {
    throw new Error(`Unsupported locale: ${options.locale}`);
  }

  if (Number.isNaN(Date.parse(options.generatedAt))) {
    throw new Error(`Invalid --generated-at value: ${options.generatedAt}`);
  }

  return options;
}

function resolveRepositoryOutput(pathText) {
  if (isAbsolute(pathText)) {
    throw new Error('Output path must be repository-relative.');
  }

  const outputPath = resolve(repositoryRoot, pathText);
  const repositoryRelative = relative(repositoryRoot, outputPath);
  if (repositoryRelative.startsWith('..') || isAbsolute(repositoryRelative)) {
    throw new Error(`Output path escapes the repository: ${pathText}`);
  }

  return outputPath;
}

async function loadBundledModule(entryPath) {
  const result = await esbuildBuild({
    entryPoints: [resolve(repositoryRoot, entryPath)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    logLevel: 'silent',
  });
  const encoded = Buffer.from(result.outputFiles[0].text).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return value;
  }

  return Number(value.toFixed(digits));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function maxDifference(left, right) {
  return Math.max(...left.map((value, index) => Math.abs(value - right[index])));
}

function quoteSqlIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function sqliteColumnType(rows, field) {
  const value = rows.find((row) => row[field] !== null && row[field] !== undefined)?.[field];
  return typeof value === 'number' ? 'REAL' : 'TEXT';
}

function executeDatasetSql(rawDatasets) {
  const database = new DatabaseSync(':memory:');
  const queriedDatasets = {};

  try {
    for (const [datasetId, rows] of Object.entries(rawDatasets)) {
      if (rows.length === 0) {
        throw new Error(`Dataset ${datasetId} must not be empty.`);
      }

      const fields = Object.keys(rows[0]);
      const columnSql = fields
        .map((field) => `${quoteSqlIdentifier(field)} ${sqliteColumnType(rows, field)}`)
        .join(', ');
      database.exec(`CREATE TABLE ${quoteSqlIdentifier(datasetId)} (${columnSql})`);
      const placeholders = fields.map(() => '?').join(', ');
      const insert = database.prepare(
        `INSERT INTO ${quoteSqlIdentifier(datasetId)} (${fields.map(quoteSqlIdentifier).join(', ')}) VALUES (${placeholders})`,
      );

      database.exec('BEGIN');
      try {
        for (const row of rows) {
          insert.run(...fields.map((field) => row[field] ?? null));
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }

      queriedDatasets[datasetId] = database.prepare(DATASET_SQL[datasetId]).all();
    }
  } finally {
    database.close();
  }

  return queriedDatasets;
}

function buildCurve(snapshot, representation, luminanceToGsdfJnd) {
  const blackNits = snapshot.metadata.displayBlackNits;
  const whiteNits = snapshot.metadata.displayWhiteNits;
  const luminanceSpan = whiteNits - blackNits;
  const displayGamma = snapshot.metadata.displayGamma;
  let deviceCodes = null;
  let outputCode255;
  let physicalNits;

  if (representation.bits === null) {
    outputCode255 = snapshot.codeRemapNorm.map((value) => value * 255);
    physicalNits = snapshot.targetEotfNorm.map((value) => blackNits + luminanceSpan * value);
  } else {
    const maximumCode = (2 ** representation.bits) - 1;
    deviceCodes = snapshot.codeRemapNorm.map((value) => Math.round(value * maximumCode));
    outputCode255 = deviceCodes.map((value) => (value / maximumCode) * 255);
    physicalNits = deviceCodes.map(
      (value) => blackNits + luminanceSpan * ((value / maximumCode) ** displayGamma),
    );
  }

  const jndIndex = physicalNits.map((value) => luminanceToGsdfJnd(value));
  const jndSteps = jndIndex.slice(1).map((value, index) => value - jndIndex[index]);
  const uniqueLevels = representation.bits === null
    ? new Set(snapshot.codeRemapNorm).size
    : new Set(deviceCodes).size;
  const duplicateTransitions = representation.bits === null
    ? snapshot.codeRemapNorm.slice(1).filter((value, index) => value === snapshot.codeRemapNorm[index]).length
    : deviceCodes.slice(1).filter((value, index) => value === deviceCodes[index]).length;
  const idealJnd = snapshot.targetEotfNorm.map(
    (value) => luminanceToGsdfJnd(blackNits + luminanceSpan * value),
  );
  const rmsJndTargetError = Math.sqrt(mean(jndIndex.map((value, index) => (value - idealJnd[index]) ** 2)));
  const averageJnd = mean(jndSteps);
  const jndSd = standardDeviation(jndSteps);
  const visibleTransitions = jndSteps.filter((value) => value >= 1).length;
  const subJndTransitions = jndSteps.length - visibleTransitions;

  return {
    representation: representation.id,
    bits: representation.bits,
    deviceCodes,
    outputCode255,
    physicalNits,
    jndIndex,
    jndSteps,
    metrics: {
      uniqueLevels,
      duplicateTransitions,
      visibleTransitions,
      subJndTransitions,
      visibleTransitionRatePct: round((visibleTransitions / jndSteps.length) * 100, 2),
      jndMean: round(averageJnd),
      jndSd: round(jndSd),
      jndCv: round(jndSd / averageJnd),
      jndMin: round(Math.min(...jndSteps)),
      jndMax: round(Math.max(...jndSteps)),
      rmsJndTargetError: round(rmsJndTargetError),
      meanNits: round(mean(physicalNits)),
      midNits: round(physicalNits[128]),
    },
  };
}

function buildAnalysis(toneModule, luminanceModule) {
  const snapshots = new Map();
  const curves = new Map();

  for (const gammaMode of GAMMA_MODES) {
    for (const formula of FORMULAS) {
      const transferFormula = formula === 'CSDF' ? 'csdf' : 'gsdf';
      const strength = formula === 'Baseline' ? 0 : 100;
      const builtSnapshot = toneModule.buildToneCurveSnapshot(
        {
          ...MODEL_SETTINGS,
          gammaTarget: gammaMode.gammaTarget,
          transferFormula,
          strength,
        },
        SNAPSHOT_OPTIONS,
      );
      const snapshot = formula === 'Baseline'
        ? {
          ...builtSnapshot,
          inputNorm: Array.from({ length: 256 }, (_, index) => index / 255),
          targetEotfNorm: Array.from({ length: 256 }, (_, index) => {
            const input = index / 255;
            const baselineCode = input ** (gammaMode.gammaTarget / MODEL_SETTINGS.displayGamma);
            return baselineCode ** MODEL_SETTINGS.displayGamma;
          }),
          codeRemapNorm: Array.from({ length: 256 }, (_, index) => {
            const input = index / 255;
            return input ** (gammaMode.gammaTarget / MODEL_SETTINGS.displayGamma);
          }),
        }
        : builtSnapshot;
      const key = `${gammaMode.id}:${formula}`;
      snapshots.set(key, snapshot);
      curves.set(
        key,
        new Map(REPRESENTATIONS.map((representation) => [
          representation.id,
          buildCurve(snapshot, representation, luminanceModule.luminanceToGsdfJnd),
        ])),
      );
    }
  }

  const neutralBaseline = snapshots.get('neutral:Baseline');
  const identityDelta = maxDifference(neutralBaseline.codeRemapNorm, neutralBaseline.inputNorm);
  const roundedNeutralBaseline = toneModule.buildToneCurveSnapshot(
    {
      ...MODEL_SETTINGS,
      transferFormula: 'gsdf',
      strength: 0,
    },
    SNAPSHOT_OPTIONS,
  );
  const adobeGsdf = snapshots.get('neutral:GSDF');
  const srgbGsdf = toneModule.buildToneCurveSnapshot(
    {
      ...MODEL_SETTINGS,
      displayGamut: 'srgb',
      transferFormula: 'gsdf',
    },
    SNAPSHOT_OPTIONS,
  );

  return {
    snapshots,
    curves,
    identityDelta,
    roundedSnapshotIdentityDelta: maxDifference(
      roundedNeutralBaseline.codeRemapNorm,
      roundedNeutralBaseline.inputNorm,
    ),
    adobeVsSrgbRemapDelta: maxDifference(adobeGsdf.codeRemapNorm, srgbGsdf.codeRemapNorm),
    jndRange: {
      min: round(luminanceModule.luminanceToGsdfJnd(adobeGsdf.metadata.displayBlackNits)),
      max: round(luminanceModule.luminanceToGsdfJnd(adobeGsdf.metadata.displayWhiteNits)),
      span: round(
        luminanceModule.luminanceToGsdfJnd(adobeGsdf.metadata.displayWhiteNits)
          - luminanceModule.luminanceToGsdfJnd(adobeGsdf.metadata.displayBlackNits),
      ),
    },
  };
}

function translation(locale) {
  const isZh = locale === 'zh-tw';
  return {
    locale,
    title: isZh
      ? 'Adobe RGB GSDF／CSDF 位深與 Gamma 起點分析'
      : 'Adobe RGB GSDF/CSDF Bit-Depth and Gamma-Starting-Point Analysis',
    description: isZh
      ? '比較專案目前 Adobe RGB 模型下的 GSDF、CSDF、8-bit、10-bit 與 Gamma compensation = 0。'
      : 'Compares GSDF, CSDF, 8-bit, 10-bit, and Gamma compensation = 0 in the project current Adobe RGB model.',
    formula: {
      Baseline: isZh ? '未套用 transfer' : 'Baseline',
      GSDF: 'GSDF',
      CSDF: 'CSDF',
    },
    gammaMode: {
      neutral: isZh ? '補償 0（P-value identity）' : 'Compensation 0 (P-value identity)',
      'forced-gamma-1': isZh ? '強制 gamma target 1.0' : 'Forced gamma target 1.0',
    },
    representation: {
      ideal: isZh ? '理想浮點' : 'Ideal float',
      '8-bit': '8-bit',
      '10-bit': '10-bit',
    },
    series: {
      baseline: isZh ? '未套用 transfer' : 'Baseline',
      gsdf: 'GSDF',
      csdf: 'CSDF',
      gsdfIdeal: isZh ? 'GSDF 理想浮點' : 'GSDF ideal',
      gsdf8: 'GSDF 8-bit',
      gsdf10: 'GSDF 10-bit',
      neutralGsdf: isZh ? 'GSDF 補償 0' : 'GSDF comp 0',
      forcedGsdf: 'GSDF γ1',
      neutralCsdf: isZh ? 'CSDF 補償 0' : 'CSDF comp 0',
      forcedCsdf: 'CSDF γ1',
    },
    labels: {
      inputCode: isZh ? '8-bit 輸入碼' : '8-bit input code',
      outputCode: isZh ? '輸出碼（正規化到 0–255）' : 'Output code (normalized to 0–255)',
      jndStep: isZh ? '相鄰輸入的 JND 階差' : 'JNDs per adjacent input step',
      inputTransition: isZh ? '輸入階差終點' : 'Input-step endpoint',
      uniqueLevels: isZh ? '不同輸出階數' : 'Unique output levels',
      case: isZh ? '情境' : 'Case',
      jndSd: isZh ? 'JND 階差標準差' : 'JND-step standard deviation',
      band: isZh ? '輸入碼區間' : 'Input-code band',
      plateaus: isZh ? '合併階差數' : 'Merged adjacent steps',
      physicalNits: isZh ? '實體亮度（nit）' : 'Physical luminance (nit)',
    },
    generatedAtLabel: isZh ? '產生時間' : 'Generated at',
    standardGamma22: isZh ? '標準 Gamma 2.2' : 'Standard gamma 2.2',
    standardGamma22Mode: isZh
      ? 'gammaTarget = displayGamma = 2.2'
      : 'gammaTarget = displayGamma = 2.2',
  };
}

function localizedFormula(t, formula) {
  return t.formula[formula];
}

function localizedMode(t, modeId) {
  return t.gammaMode[modeId];
}

function localizedRepresentation(t, representation) {
  return t.representation[representation];
}

function curveFor(analysis, gammaMode, formula, representation) {
  return analysis.curves.get(`${gammaMode}:${formula}`).get(representation);
}

function snapshotFor(analysis, gammaMode, formula) {
  return analysis.snapshots.get(`${gammaMode}:${formula}`);
}

function buildDatasets(analysis, t) {
  const summaryMetrics = [];
  for (const gammaMode of GAMMA_MODES) {
    const formulas = gammaMode.id === 'neutral' ? FORMULAS : ['GSDF', 'CSDF'];
    for (const formula of formulas) {
      for (const representation of REPRESENTATIONS) {
        const curve = curveFor(analysis, gammaMode.id, formula, representation.id);
        const modeLabel = localizedMode(t, gammaMode.id);
        const formulaLabel = localizedFormula(t, formula);
        const representationLabel = localizedRepresentation(t, representation.id);
        const standardGamma22 = formula === 'Baseline';
        const compactModeLabel = standardGamma22
          ? t.standardGamma22Mode
          : gammaMode.id === 'neutral'
          ? (t.locale === 'zh-tw' ? '補償 0' : 'Neutral')
          : (t.locale === 'zh-tw' ? 'γ1 代理' : 'γ1 proxy');
        summaryMetrics.push({
          caseLabel: standardGamma22
            ? `${t.standardGamma22} · ${representationLabel}`
            : `${formulaLabel} · ${compactModeLabel} · ${representationLabel}`,
          formula: standardGamma22 ? t.standardGamma22 : formulaLabel,
          formulaId: formula,
          gammaMode: standardGamma22 ? t.standardGamma22Mode : modeLabel,
          gammaModeId: gammaMode.id,
          representation: representationLabel,
          representationId: representation.id,
          uniqueLevels: curve.metrics.uniqueLevels,
          duplicateTransitions: curve.metrics.duplicateTransitions,
          visibleTransitions: curve.metrics.visibleTransitions,
          subJndTransitions: curve.metrics.subJndTransitions,
          visibleTransitionRatePct: curve.metrics.visibleTransitionRatePct,
          jndMean: curve.metrics.jndMean,
          jndSd: curve.metrics.jndSd,
          jndCv: curve.metrics.jndCv,
          jndMin: curve.metrics.jndMin,
          jndMax: curve.metrics.jndMax,
          rmsJndTargetError: curve.metrics.rmsJndTargetError,
          meanNits: curve.metrics.meanNits,
          midNits: curve.metrics.midNits,
        });
      }
    }
  }

  const mappingNeutral = [];
  const mappingSeries = [
    ['Baseline', t.series.baseline],
    ['GSDF', t.series.gsdf],
    ['CSDF', t.series.csdf],
  ];
  for (const [formula, series] of mappingSeries) {
    const curve = curveFor(analysis, 'neutral', formula, 'ideal');
    for (const inputCode of CURVE_CHART_CODES) {
      mappingNeutral.push({
        inputCode,
        series,
        outputCode: round(curve.outputCode255[inputCode], 3),
        physicalNits: round(curve.physicalNits[inputCode], 5),
        jndIndex: round(curve.jndIndex[inputCode], 4),
      });
    }
  }

  const jndGsdf = [];
  const jndSeries = [
    ['Baseline', '8-bit', t.series.baseline],
    ['GSDF', 'ideal', t.series.gsdfIdeal],
    ['GSDF', '8-bit', t.series.gsdf8],
    ['GSDF', '10-bit', t.series.gsdf10],
  ];
  for (const [formula, representation, series] of jndSeries) {
    const curve = curveFor(analysis, 'neutral', formula, representation);
    for (const band of JND_CHART_BANDS) {
      const bandSteps = curve.jndSteps.slice(band.start, band.end);
      jndGsdf.push({
        inputTransition: band.end,
        inputBand: `${band.start + 1}-${band.end}`,
        series,
        jndStep: round(mean(bandSteps), 5),
        bandJndMin: round(Math.min(...bandSteps), 5),
        bandJndMax: round(Math.max(...bandSteps), 5),
        zeroIntervals: bandSteps.filter((value) => Math.abs(value) < 1e-9).length,
        intervalCount: bandSteps.length,
      });
    }
  }

  const gammaSensitivity = [];
  const gammaSeries = [
    ['neutral', 'GSDF', t.series.neutralGsdf],
    ['forced-gamma-1', 'GSDF', t.series.forcedGsdf],
    ['neutral', 'CSDF', t.series.neutralCsdf],
    ['forced-gamma-1', 'CSDF', t.series.forcedCsdf],
  ];
  for (const [gammaMode, formula, series] of gammaSeries) {
    const curve = curveFor(analysis, gammaMode, formula, 'ideal');
    for (const inputCode of CURVE_CHART_CODES) {
      gammaSensitivity.push({
        inputCode,
        series,
        outputCode: round(curve.outputCode255[inputCode], 3),
        physicalNits: round(curve.physicalNits[inputCode], 5),
      });
    }
  }

  const quantizationSummary = summaryMetrics
    .filter((row) => row.formulaId !== 'Baseline'
      && (row.representationId === '8-bit' || row.representationId === '10-bit'))
    .map((row) => ({ ...row }));

  const plateauBands = [];
  for (const formula of ['GSDF', 'CSDF']) {
    const curve = curveFor(analysis, 'neutral', formula, '8-bit');
    for (const band of INPUT_BANDS) {
      const deviceCodes = curve.deviceCodes.slice(band.start, band.end + 1);
      plateauBands.push({
        band: band.id,
        formula: localizedFormula(t, formula),
        plateauCount: deviceCodes.slice(1).filter((value, index) => value === deviceCodes[index]).length,
        distinctOutputLevels: new Set(deviceCodes).size,
        inputLevels: deviceCodes.length,
      });
    }
  }

  const brightnessSamples = SAMPLE_CODES.map((inputCode) => ({
    inputCode,
    baselineNits: round(curveFor(analysis, 'neutral', 'Baseline', '8-bit').physicalNits[inputCode], 5),
    gsdfIdealNits: round(curveFor(analysis, 'neutral', 'GSDF', 'ideal').physicalNits[inputCode], 5),
    gsdf8Nits: round(curveFor(analysis, 'neutral', 'GSDF', '8-bit').physicalNits[inputCode], 5),
    gsdf10Nits: round(curveFor(analysis, 'neutral', 'GSDF', '10-bit').physicalNits[inputCode], 5),
    csdfIdealNits: round(curveFor(analysis, 'neutral', 'CSDF', 'ideal').physicalNits[inputCode], 5),
    csdf8Nits: round(curveFor(analysis, 'neutral', 'CSDF', '8-bit').physicalNits[inputCode], 5),
    csdf10Nits: round(curveFor(analysis, 'neutral', 'CSDF', '10-bit').physicalNits[inputCode], 5),
  }));

  const gsdf8 = summaryMetrics.find(
    (row) => row.formulaId === 'GSDF' && row.gammaModeId === 'neutral' && row.representationId === '8-bit',
  );
  const csdf8 = summaryMetrics.find(
    (row) => row.formulaId === 'CSDF' && row.gammaModeId === 'neutral' && row.representationId === '8-bit',
  );
  const gsdf10 = summaryMetrics.find(
    (row) => row.formulaId === 'GSDF' && row.gammaModeId === 'neutral' && row.representationId === '10-bit',
  );
  const headlineMetrics = [
    {
      metricId: 'gsdf8',
      uniqueLevels: gsdf8.uniqueLevels,
      duplicateTransitions: gsdf8.duplicateTransitions,
      jndSd: gsdf8.jndSd,
      maxRemapDelta: null,
    },
    {
      metricId: 'csdf8',
      uniqueLevels: csdf8.uniqueLevels,
      duplicateTransitions: csdf8.duplicateTransitions,
      jndSd: csdf8.jndSd,
      maxRemapDelta: null,
    },
    {
      metricId: 'gsdf10',
      uniqueLevels: gsdf10.uniqueLevels,
      duplicateTransitions: gsdf10.duplicateTransitions,
      jndSd: gsdf10.jndSd,
      maxRemapDelta: null,
    },
    {
      metricId: 'gamma0',
      uniqueLevels: null,
      duplicateTransitions: null,
      jndSd: null,
      maxRemapDelta: round(analysis.identityDelta, 8),
    },
  ];

  return {
    summary_metrics: summaryMetrics,
    mapping_neutral: mappingNeutral,
    jnd_gsdf: jndGsdf,
    gamma_sensitivity: gammaSensitivity,
    quantization_summary: quantizationSummary,
    plateau_bands: plateauBands,
    brightness_samples: brightnessSamples,
    headline_metrics: headlineMetrics,
  };
}

function findSummary(datasets, formulaId, gammaModeId, representationId) {
  return datasets.summary_metrics.find(
    (row) => row.formulaId === formulaId
      && row.gammaModeId === gammaModeId
      && row.representationId === representationId,
  );
}

function buildNarrative(locale, analysis, datasets, generatedAt) {
  const zh = locale === 'zh-tw';
  const gsdfIdeal = findSummary(datasets, 'GSDF', 'neutral', 'ideal');
  const standardGamma8 = findSummary(datasets, 'Baseline', 'neutral', '8-bit');
  const standardGamma10 = findSummary(datasets, 'Baseline', 'neutral', '10-bit');
  const gsdf8 = findSummary(datasets, 'GSDF', 'neutral', '8-bit');
  const gsdf10 = findSummary(datasets, 'GSDF', 'neutral', '10-bit');
  const csdfIdeal = findSummary(datasets, 'CSDF', 'neutral', 'ideal');
  const csdf8 = findSummary(datasets, 'CSDF', 'neutral', '8-bit');
  const csdf10 = findSummary(datasets, 'CSDF', 'neutral', '10-bit');
  const forcedGsdf = findSummary(datasets, 'GSDF', 'forced-gamma-1', 'ideal');
  const forcedCsdf = findSummary(datasets, 'CSDF', 'forced-gamma-1', 'ideal');
  const neutralGsdfMid = gsdfIdeal.midNits;
  const forcedGsdfMid = forcedGsdf.midNits;
  const neutralCsdfMid = csdfIdeal.midNits;
  const forcedCsdfMid = forcedCsdf.midNits;

  if (zh) {
    return {
      technicalSummary: `## 技術摘要\n\n- **標準 Gamma 2.2 已加入比較基準。** 硬 8-bit 保留 ${standardGamma8.uniqueLevels} 個裝置碼，但只有 ${standardGamma8.visibleTransitions}/255 個相鄰階差達到 ΔJND ≥ 1（${standardGamma8.visibleTransitionRatePct.toFixed(2)}%）；10-bit 在相同 256 階輸入下為 ${standardGamma10.visibleTransitions}/255（${standardGamma10.visibleTransitionRatePct.toFixed(2)}%）。\n- **理想浮點 GSDF 的感知均勻性成立。** 在 0.1–100 nit 範圍，255 個輸入間隔平均跨越 ${gsdfIdeal.jndMean.toFixed(4)} JND，標準差只有 ${gsdfIdeal.jndSd.toFixed(4)}。\n- **硬 8-bit 會削弱這項優勢。** GSDF 只留下 ${gsdf8.uniqueLevels} 個不同輸出階、合併 ${gsdf8.duplicateTransitions} 組相鄰輸入；CSDF 留下 ${csdf8.uniqueLevels} 階、合併 ${csdf8.duplicateTransitions} 組。\n- **10-bit 足以保留所有 256 個輸入階。** GSDF 與 CSDF 都有 ${gsdf10.uniqueLevels}/${csdf10.uniqueLevels} 個不同輸出階且沒有 plateau；GSDF 的 JND 階差標準差降到 ${gsdf10.jndSd.toFixed(4)}。\n- **Gamma compensation = 0 不會產生另一條「線性亮度」曲線。** 它令 gammaTarget 與 displayGamma 同為 2.2，因此 P-value/code 軸保持 identity，最大 remap 差為 ${analysis.identityDelta.toFixed(8)}；若強制 gammaTarget = 1.0，中灰亮度會由 GSDF ${neutralGsdfMid.toFixed(2)} nit 變為 ${forcedGsdfMid.toFixed(2)} nit、CSDF ${neutralCsdfMid.toFixed(2)} nit 變為 ${forcedCsdfMid.toFixed(2)} nit，但這等價於 UI +100 的極端補償，不是補償 0。`,
      mappingIntro: `## GSDF 與 CSDF 重新分配亮度，而不是增加 8-bit 階數\n\n下圖比較未套用 transfer、GSDF 與 CSDF 的理想輸出碼。GSDF 把深暗至中間調壓向較低輸出碼，再把亮部拉開；CSDF 加入專案自訂的 shadow bias 與 toe，暗部比 GSDF 更亮。Adobe RGB 不改變這條中性灰 remap 曲線；它影響彩色內容的 luma 權重與 ICC source TRC。`,
      jndIntro: `## 8-bit plateau 破壞 GSDF 的等 JND 目標，10-bit 大幅恢復\n\n理想 GSDF 幾乎是一條水平線；硬 8-bit 出現 ${gsdf8.duplicateTransitions} 個零 JND 階差與跳碼尖峰。10-bit 沒有相鄰輸入合併，雖仍有量化誤差，但階差分布明顯接近理想曲線。`,
      quantIntro: `## 10-bit 消除相鄰輸入合併\n\n在本次 256 階輸入下，10-bit 的 1024 個裝置碼足以讓 GSDF、CSDF 與兩種 Gamma 情境都保有 256 個唯一輸出。8-bit 的非線性單調 remap 則不可能同時保留 256 個唯一整數輸出，除非退化成 identity。`,
      jndSdIntro: `## GSDF 在高位深下最接近感知均勻\n\nJND 階差標準差越小，代表相鄰輸入在感知尺度上越均勻。理想 GSDF 為 ${gsdfIdeal.jndSd.toFixed(4)}，硬 8-bit 反而上升到 ${gsdf8.jndSd.toFixed(4)}；10-bit 降回 ${gsdf10.jndSd.toFixed(4)}。CSDF 的理想標準差為 ${csdfIdeal.jndSd.toFixed(4)}，因為它刻意加入暗部偏壓，所以不是嚴格等 JND 曲線。`,
      plateauIntro: `## 8-bit 合併主要集中在暗部與暗中間調\n\nplateau 並非平均分布。GSDF 的 ${gsdf8.duplicateTransitions} 組合併幾乎都落在輸入 0–127；192 以上沒有相鄰輸入合併，亮部以跳過部分裝置碼換取較大的局部對比。`,
      gammaIntro: `## 「補償 0」是 code/P-value identity，不是 linear-light 宣告\n\n目前程式先以 gammaTarget/displayGamma 比值調整輸入碼，再送進 GSDF／CSDF。補償 0 時比值為 1，所以結果就是本報告的 neutral 曲線，與前次計算相同。強制 gammaTarget = 1.0 的敏感度曲線顯著變亮，但它改變的是 transfer 前的 code warp；目前 sourceIsLinear 並沒有可用的獨立線性來源模式。`,
      exactStatsIntro: `## 完整統計保留公式、Gamma 模式與位深切面\n\n下表加入標準 Gamma 2.2 的 ideal、8-bit 與 10-bit 基準列，並列出 ΔJND ≥ 1 的可辨識相鄰階差數、低於 1 JND 的階差數與可辨識率。其餘列保留 GSDF／CSDF 的唯一階數、plateau、亮度與量化統計。`,
      jndDetailIntro: `## JND 分布揭示標準 Gamma 2.2 與感知曲線的差異\n\n相同的平均 JND 階差不代表相同的均勻性。標準 Gamma 2.2 基準列可直接和 GSDF／CSDF 比較；標準差、變異係數、最小／最大階差與目標 RMSE 可區分暗部低於門檻的階差、plateau 與跳碼尖峰。`,
      brightnessIntro: `## 代表性輸入碼顯示暗部、灰階與亮部的實際 nit 變化\n\n精確值能補足曲線圖的形狀判讀。8-bit 與 10-bit 欄位均先量化裝置碼，再依預設 2.2 display gamma 轉回 0.1–100 nit。`,
      scope: `## 範圍、資料與指標定義\n\n- **顯示模型：** Adobe RGB、IPS 1000:1、Lmax 100 nit、有效黑位 0.1 nit、display gamma 2.2、Black/White 0/256、strength 100%。\n- **標準 Gamma 2.2：** 不套用 GSDF／CSDF，gammaTarget 與 displayGamma 均為 2.2；8-bit 為輸入碼到裝置碼的 identity 基準。\n- **輸入母體：** 完整 8-bit 灰階碼 0–255，共 256 個樣本與 255 個相鄰階差。\n- **GSDF：** 依目前 DICOM GSDF 反函式在 JND index 間插值。\n- **CSDF：** 專案自訂的 contrast-aware GSDF 變體，不是 DICOM 規範的彩色標準。\n- **可辨識相鄰階差：** 模型中相鄰輸出的 ΔJND ≥ 1；可辨識率以符合門檻的階差數除以 255。這是標準觀察者模型，不是特定使用者或環境的實測。\n- **硬位深：** 將浮點輸出碼四捨五入到 255 或 1023，再以 display gamma 還原實體亮度。`,
      methodology: `## 計算方法與可重現性\n\n分析腳本直接 bundle 並呼叫目前的 [buildToneCurveSnapshot.ts](../src/color/buildToneCurveSnapshot.ts) 與 [perceptualLuminance.ts](../src/color/perceptualLuminance.ts)，沒有重新抄寫另一份 GSDF／CSDF 公式。每個情境都使用同一組 256 個輸入碼，先取得理想 target EOTF 與 code remap，再進行 8/10-bit nearest-code 量化，最後以 DICOM JND 反函式計算相鄰階差。\n\nDICOM 將一個 JND 定義為指定觀看條件下平均觀察者剛可察覺的亮度差；PS3.14 也說明離散輸出階數會限制 contrast resolution。[DICOM PS3.14 definitions](https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_3.html) · [DICOM PS3.14 methodology](https://dicom.nema.org/medical/dicom/current/output/chtml/part14/sect_c.2.html)\n\n報告時間：${generatedAt}`,
      limitations: `## 限制、未知與穩健性檢查\n\n- **VERIFIED：** TypeScript 模型、extension mirror、Adobe RGB 灰階 remap 不變性、8/10-bit nearest-code 統計。\n- **INFERRED：** ΔJND ≥ 1 被視為平均觀察者可辨識；實際感受仍受觀看距離、環境光、畫面紋理與 adaptation 影響。\n- **UNKNOWN：** 瀏覽器 compositor、GPU 輸出與面板是否使用內建 temporal/spatial dithering 或 FRC。若存在，實際結果會介於硬量化與理想浮點之間。\n- DICOM GSDF 對彩色影像沒有規範性要求；Adobe RGB 彩色內容的結果是專案設計延伸。\n- 強制 gammaTarget = 1.0 只是敏感度代理，不能替代真正的 source transfer metadata 或 sourceIsLinear 模型分支。\n- 報告 baseline 採 extension neutral bypass 的精確 identity。若單獨呼叫 5 位小數 snapshot 的 strength = 0 round-trip，最大 code 差為 ${analysis.roundedSnapshotIdentityDelta.toFixed(5)}；這是序列化精度效應，不是 Gamma compensation = 0 的前級差異。`,
      recommendations: `## 建議的實作與驗證順序\n\n1. **將 10-bit／高精度輸出列為首選路徑。** 本模型下它保留全部 256 個輸入階並顯著降低 JND 階差誤差。\n2. **8-bit 路徑保留 Dither Beta，但不要宣稱恢復真實位深。** 現行噪聲可遮蔽 banding，不能保證重建被合併的單調階差。\n3. **UI 將「Gamma compensation = 0」標示為 code/P-value neutral。** 若要支援線性光來源，應新增明確 source transfer 選項，而不是把 gammaTarget = 1.0 當作等價替代。\n4. **以實機 photometer 與灰階 ramp 驗證。** 至少量測 0–31、32–127、128–191、192–255 四區的實際 DDL→nit 與 JND 階差，再決定 8-bit 是否預設啟用 dithering。`,
      further: `## 後續問題\n\n- 實際 Adobe RGB 顯示路徑是原生 10-bit、8-bit + FRC，還是硬 8-bit？\n- Chromium 與作業系統色彩管理是否在 SVG filter 後另行量化或 dithering？\n- Dither Beta 應維持固定 ±code noise，或改為以 LUT 量化誤差驅動的 blue-noise／temporal 策略？\n- 彩色內容是否應以 Adobe RGB luma JND、逐 channel CSDF，或另一個受控色彩外觀模型處理？`,
    };
  }

  return {
    technicalSummary: `## Technical summary\n\n- **Standard gamma 2.2 is now included as the comparison baseline.** Hard 8-bit retains ${standardGamma8.uniqueLevels} device codes, but only ${standardGamma8.visibleTransitions}/255 adjacent intervals reach ΔJND ≥ 1 (${standardGamma8.visibleTransitionRatePct.toFixed(2)}%); 10-bit with the same 256 input levels reaches ${standardGamma10.visibleTransitions}/255 (${standardGamma10.visibleTransitionRatePct.toFixed(2)}%).\n- **Ideal floating-point GSDF is perceptually uniform in the model.** Across 0.1–100 nit, the 255 input intervals average ${gsdfIdeal.jndMean.toFixed(4)} JND with only ${gsdfIdeal.jndSd.toFixed(4)} standard deviation.\n- **Hard 8-bit output weakens that result.** GSDF retains ${gsdf8.uniqueLevels} unique output levels and merges ${gsdf8.duplicateTransitions} adjacent inputs; CSDF retains ${csdf8.uniqueLevels} levels and merges ${csdf8.duplicateTransitions}.\n- **10-bit preserves all 256 input levels.** GSDF and CSDF retain ${gsdf10.uniqueLevels}/${csdf10.uniqueLevels} unique levels with no plateaus; GSDF JND-step standard deviation falls to ${gsdf10.jndSd.toFixed(4)}.\n- **Gamma compensation = 0 does not create a separate linear-light curve.** It keeps gammaTarget and displayGamma at 2.2, so the P-value/code axis is identity with a maximum remap difference of ${analysis.identityDelta.toFixed(8)}. Forcing gammaTarget = 1.0 moves mid-gray from ${neutralGsdfMid.toFixed(2)} to ${forcedGsdfMid.toFixed(2)} nit for GSDF and from ${neutralCsdfMid.toFixed(2)} to ${forcedCsdfMid.toFixed(2)} nit for CSDF, but that is the UI +100 extreme rather than neutral compensation.`,
    mappingIntro: `## GSDF and CSDF redistribute luminance rather than adding 8-bit levels\n\nThe chart compares the ideal output code for the baseline, GSDF, and CSDF. GSDF compresses deep shadows through mid-tones into lower output codes and expands the highlights. CSDF adds the project-specific shadow bias and toe, so it is brighter than GSDF in the dark range. Adobe RGB does not change this neutral-gray remap; it changes color luma weights and the ICC source TRC.`,
    jndIntro: `## 8-bit plateaus break the equal-JND target; 10-bit largely restores it\n\nIdeal GSDF is almost horizontal. Hard 8-bit introduces ${gsdf8.duplicateTransitions} zero-JND intervals and code-skip spikes. At 10-bit, no adjacent inputs merge and the distribution moves much closer to the ideal curve.`,
    quantIntro: `## 10-bit eliminates adjacent-input merging\n\nFor 256 input levels, 10-bit device code space is sufficient for every GSDF, CSDF, and Gamma scenario to retain 256 unique outputs. A nonlinear monotonic 8-bit remap cannot preserve all 256 unique integer outputs unless it collapses to identity.`,
    jndSdIntro: `## GSDF is most perceptually uniform at higher precision\n\nLower JND-step standard deviation means more uniform perceptual spacing. Ideal GSDF is ${gsdfIdeal.jndSd.toFixed(4)}, hard 8-bit rises to ${gsdf8.jndSd.toFixed(4)}, and 10-bit returns to ${gsdf10.jndSd.toFixed(4)}. Ideal CSDF is ${csdfIdeal.jndSd.toFixed(4)} because its deliberate shadow bias makes it a contrast-aware project variant rather than a strict equal-JND curve.`,
    plateauIntro: `## 8-bit merging is concentrated in shadows and dark mid-tones\n\nThe ${gsdf8.duplicateTransitions} GSDF plateaus are almost entirely below input code 128. Above 192, no adjacent inputs merge; highlights instead skip device codes to gain local contrast.`,
    gammaIntro: `## Compensation 0 is code/P-value identity, not a linear-light declaration\n\nThe current implementation warps the input code by gammaTarget/displayGamma before GSDF or CSDF. At compensation 0 the ratio is 1, so this report neutral curve is identical to the previous calculation. The forced gammaTarget = 1.0 sensitivity curve becomes much brighter, but it changes the pre-transfer code warp; sourceIsLinear is not an independent active source mode today.`,
    exactStatsIntro: `## Complete statistics preserve formula, Gamma mode, and bit-depth cuts\n\nThe table now includes standard gamma 2.2 ideal, 8-bit, and 10-bit baseline rows, with the number and rate of adjacent intervals at ΔJND ≥ 1 plus the count below 1 JND. The remaining rows preserve GSDF/CSDF unique-level, plateau, luminance, and quantization statistics.`,
    jndDetailIntro: `## JND distribution separates standard gamma 2.2 from perceptual curves\n\nEqual mean JND does not imply equal uniformity. The standard gamma 2.2 baseline can be compared directly with GSDF and CSDF; standard deviation, coefficient of variation, minimum/maximum interval, and target RMSE distinguish sub-threshold shadow intervals from plateaus and code-skip spikes.`,
    brightnessIntro: `## Representative codes show the physical-nit impact in shadows, gray, and highlights\n\nExact values complement the curve shapes. The 8-bit and 10-bit columns first quantize device codes, then decode them through the default 2.2 display gamma into the 0.1–100 nit range.`,
    scope: `## Scope, data, and metric definitions\n\n- **Display model:** Adobe RGB, IPS 1000:1, Lmax 100 nit, effective black 0.1 nit, display gamma 2.2, Black/White 0/256, strength 100%.\n- **Standard gamma 2.2:** no GSDF/CSDF transfer, with gammaTarget and displayGamma both set to 2.2; 8-bit is the identity input-code-to-device-code baseline.\n- **Population:** the complete 8-bit grayscale code range 0–255, comprising 256 samples and 255 adjacent intervals.\n- **GSDF:** current DICOM GSDF inverse interpolation over JND index.\n- **CSDF:** the project contrast-aware GSDF variant, not a DICOM-standardized color function.\n- **Discernible adjacent interval:** modeled output ΔJND ≥ 1; the rate divides qualifying intervals by 255. This is a standard-observer model, not a measured individual result.\n- **Hard bit depth:** nearest-code rounding to 255 or 1023 followed by display-gamma decoding to physical luminance.`,
    methodology: `## Method and reproducibility\n\nThe analysis script bundles and calls the current [buildToneCurveSnapshot.ts](../src/color/buildToneCurveSnapshot.ts) and [perceptualLuminance.ts](../src/color/perceptualLuminance.ts); it does not duplicate a separate GSDF/CSDF implementation. Every scenario uses the same 256 input codes, obtains the ideal target EOTF and code remap, applies nearest-code 8/10-bit quantization, and then calculates adjacent intervals with the DICOM JND inverse.\n\nDICOM defines one JND as the luminance difference that an average observer can just perceive under specified conditions, and PS3.14 notes that discrete output levels limit contrast resolution. [DICOM PS3.14 definitions](https://dicom.nema.org/medical/dicom/current/output/chtml/part14/chapter_3.html) · [DICOM PS3.14 methodology](https://dicom.nema.org/medical/dicom/current/output/chtml/part14/sect_c.2.html)\n\nGenerated at: ${generatedAt}`,
    limitations: `## Limitations, uncertainty, and robustness checks\n\n- **VERIFIED:** current TypeScript model, extension mirror, Adobe RGB neutral-remap invariance, and nearest-code 8/10-bit statistics.\n- **INFERRED:** ΔJND ≥ 1 is treated as visible to the average observer; actual perception depends on viewing distance, ambient light, texture, and adaptation.\n- **UNKNOWN:** whether the browser compositor, GPU output, and panel add temporal/spatial dithering or FRC. If they do, real behavior lies between hard quantization and ideal float.\n- DICOM GSDF does not normatively define color-image rendition; Adobe RGB color behavior is a project extension.\n- Forced gammaTarget = 1.0 is a sensitivity proxy, not a replacement for source transfer metadata or a sourceIsLinear model branch.\n- The report baseline uses the extension neutral bypass as an exact identity. Calling the five-decimal strength = 0 snapshot round-trip directly produces up to ${analysis.roundedSnapshotIdentityDelta.toFixed(5)} code error; that is serialization precision, not a pre-transfer difference caused by Gamma compensation = 0.`,
    recommendations: `## Recommended implementation and validation order\n\n1. **Prefer a 10-bit or higher-precision output path.** It preserves all 256 input levels and materially lowers JND-step error in this model.\n2. **Retain Dither Beta for 8-bit, but do not describe it as restoring physical bit depth.** Noise can mask banding but cannot guarantee reconstruction of merged monotonic levels.\n3. **Label Gamma compensation = 0 as code/P-value neutral.** If linear-light sources are required, add an explicit source-transfer mode rather than treating gammaTarget = 1.0 as equivalent.\n4. **Validate with a photometer and grayscale ramps.** Measure actual DDL→nit and JND intervals across at least 0–31, 32–127, 128–191, and 192–255 before deciding whether 8-bit should enable dithering by default.`,
    further: `## Further questions\n\n- Is the real Adobe RGB display path native 10-bit, 8-bit + FRC, or hard 8-bit?\n- Does Chromium or OS color management quantize or dither after the SVG filter?\n- Should Dither Beta remain fixed code noise or become LUT-quantization-aware blue-noise/temporal dithering?\n- Should color content use Adobe RGB luma JND, per-channel CSDF, or a controlled color-appearance model?`,
  };
}

function buildArtifact(locale, generatedAt, analysis) {
  const t = translation(locale);
  const datasets = executeDatasetSql(buildDatasets(analysis, t));
  const narrative = buildNarrative(locale, analysis, datasets, generatedAt);
  const zh = locale === 'zh-tw';
  const sourceIdForDataset = (datasetId) => `${datasetId}_sql`;
  const cards = [];

  const charts = [
    {
      id: 'mapping_curve',
      title: zh ? '輸入碼對輸出碼曲線' : 'Output code mapping by input code',
      subtitle: zh ? 'Adobe RGB、0.1–100 nit、補償 0；理想浮點值' : 'Adobe RGB, 0.1–100 nit, compensation 0; ideal floating-point values',
      type: 'line',
      intent: 'trend',
      dataset: 'mapping_neutral',
      sourceId: sourceIdForDataset('mapping_neutral'),
      encodings: {
        x: { field: 'inputCode', type: 'quantitative', label: t.labels.inputCode },
        y: { field: 'outputCode', type: 'quantitative', label: t.labels.outputCode },
        color: { field: 'series', type: 'nominal', label: zh ? '曲線' : 'Curve' },
        lineStyle: { field: 'series', type: 'nominal', label: zh ? '曲線' : 'Curve' },
        tooltip: [
          { field: 'physicalNits', type: 'quantitative', label: t.labels.physicalNits },
          { field: 'jndIndex', type: 'quantitative', label: 'JND index' },
        ],
      },
      comparisonContext: { grain: '256 input codes', unit: 'normalized device code' },
      palette: { kind: 'categorical', name: 'blue-orange-neutral' },
      legend: { position: 'bottom', sort: 'spec' },
      settings: { showPoints: 'never', sort: 'none' },
      layout: 'full',
    },
    {
      id: 'jnd_curve',
      title: zh ? 'GSDF 相鄰輸入的 JND 階差' : 'Adjacent JND steps for GSDF',
      subtitle: zh ? '16-code band 平均；比較 baseline、理想浮點、硬 8-bit 與硬 10-bit' : '16-code-band averages for baseline, ideal float, hard 8-bit, and hard 10-bit',
      type: 'line',
      intent: 'trend',
      dataset: 'jnd_gsdf',
      sourceId: sourceIdForDataset('jnd_gsdf'),
      encodings: {
        x: { field: 'inputTransition', type: 'quantitative', label: t.labels.inputTransition },
        y: { field: 'jndStep', type: 'quantitative', label: t.labels.jndStep },
        color: { field: 'series', type: 'nominal', label: zh ? '表示方式' : 'Representation' },
        lineStyle: { field: 'series', type: 'nominal', label: zh ? '表示方式' : 'Representation' },
        tooltip: [
          { field: 'inputBand', type: 'text', label: zh ? '階差區間' : 'Interval band' },
          { field: 'bandJndMin', type: 'quantitative', label: zh ? 'band JND 最小' : 'Band JND min' },
          { field: 'bandJndMax', type: 'quantitative', label: zh ? 'band JND 最大' : 'Band JND max' },
          { field: 'zeroIntervals', type: 'quantitative', label: zh ? '零階差數' : 'Zero intervals' },
        ],
      },
      referenceLines: [{ axis: 'y', value: 1, label: '1 JND', color: 'neutral', lineStyle: 'dashed' }],
      palette: { kind: 'categorical', name: 'blue-orange-neutral' },
      legend: { position: 'bottom', sort: 'spec' },
      settings: { showPoints: 'never', sort: 'none' },
      layout: 'full',
    },
    {
      id: 'unique_levels_chart',
      title: zh ? '量化後的不同輸出階數' : 'Unique output levels after quantization',
      subtitle: zh ? '每個情境都使用完整 256 階輸入；橫軸從 0 開始' : 'Every case uses all 256 input levels; axis starts at zero',
      type: 'horizontalBar',
      intent: 'comparison',
      dataset: 'quantization_summary',
      sourceId: sourceIdForDataset('quantization_summary'),
      encodings: {
        x: { field: 'caseLabel', type: 'nominal', label: t.labels.case },
        y: { field: 'uniqueLevels', type: 'quantitative', label: t.labels.uniqueLevels },
        tooltip: [
          { field: 'duplicateTransitions', type: 'quantitative', label: zh ? '合併階差' : 'Merged steps' },
          { field: 'jndSd', type: 'quantitative', label: t.labels.jndSd },
        ],
      },
      palette: { kind: 'sequential', name: 'blue' },
      labels: { values: 'none' },
      settings: { sort: 'descending', showValues: false, categoryLabelPolicy: 'wrap' },
      layout: 'full',
    },
    {
      id: 'jnd_sd_chart',
      title: zh ? '量化後的 JND 階差標準差' : 'JND-step standard deviation after quantization',
      subtitle: zh ? '數值越低代表感知階差越均勻；橫軸從 0 開始' : 'Lower is more perceptually uniform; axis starts at zero',
      type: 'horizontalBar',
      intent: 'comparison',
      dataset: 'quantization_summary',
      sourceId: sourceIdForDataset('quantization_summary'),
      encodings: {
        x: { field: 'caseLabel', type: 'nominal', label: t.labels.case },
        y: { field: 'jndSd', type: 'quantitative', label: t.labels.jndSd },
        tooltip: [
          { field: 'jndMean', type: 'quantitative', label: zh ? '平均 JND 階差' : 'Mean JND step' },
          { field: 'rmsJndTargetError', type: 'quantitative', label: zh ? '目標 JND RMSE' : 'Target JND RMSE' },
        ],
      },
      palette: { kind: 'sequential', name: 'orange' },
      labels: { values: 'none' },
      settings: { sort: 'ascending', showValues: false, categoryLabelPolicy: 'wrap' },
      layout: 'full',
    },
    {
      id: 'plateau_chart',
      title: zh ? '8-bit plateau 的輸入碼分布' : '8-bit plateau distribution by input-code band',
      subtitle: zh ? '補償 0；每根柱代表該區間被合併的相鄰輸入數' : 'Compensation 0; each bar counts merged adjacent inputs in the band',
      type: 'bar',
      intent: 'comparison',
      dataset: 'plateau_bands',
      sourceId: sourceIdForDataset('plateau_bands'),
      encodings: {
        x: { field: 'band', type: 'ordinal', label: t.labels.band },
        y: { field: 'plateauCount', type: 'quantitative', label: t.labels.plateaus },
        color: { field: 'formula', type: 'nominal', label: zh ? '公式' : 'Formula' },
        tooltip: [
          { field: 'distinctOutputLevels', type: 'quantitative', label: t.labels.uniqueLevels },
          { field: 'inputLevels', type: 'quantitative', label: zh ? '輸入階數' : 'Input levels' },
        ],
      },
      palette: { kind: 'categorical', name: 'blue-orange' },
      legend: { position: 'bottom', sort: 'spec' },
      labels: { values: 'none' },
      settings: { groupMode: 'grouped', sort: 'none', showValues: false },
      layout: 'full',
    },
    {
      id: 'gamma_sensitivity_chart',
      title: zh ? 'Gamma target 對輸出碼曲線的敏感度' : 'Output-code sensitivity to gamma target',
      subtitle: zh ? '補償 0（gammaTarget 2.2）對照強制 gammaTarget 1.0' : 'Compensation 0 (gammaTarget 2.2) versus forced gammaTarget 1.0',
      type: 'line',
      intent: 'trend',
      dataset: 'gamma_sensitivity',
      sourceId: sourceIdForDataset('gamma_sensitivity'),
      encodings: {
        x: { field: 'inputCode', type: 'quantitative', label: t.labels.inputCode },
        y: { field: 'outputCode', type: 'quantitative', label: t.labels.outputCode },
        color: { field: 'series', type: 'nominal', label: zh ? '情境' : 'Case' },
        lineStyle: { field: 'series', type: 'nominal', label: zh ? '情境' : 'Case' },
        tooltip: [{ field: 'physicalNits', type: 'quantitative', label: t.labels.physicalNits }],
      },
      palette: { kind: 'categorical', name: 'blue-orange-neutral' },
      legend: { position: 'bottom', sort: 'spec' },
      settings: { showPoints: 'never', sort: 'none' },
      layout: 'full',
    },
  ];

  const tables = [
    {
      id: 'summary_table',
      title: zh ? '公式、Gamma 與位深統計' : 'Formula, Gamma, and bit-depth statistics',
      subtitle: zh ? '標準 Gamma 2.2 三列加 12 個 transfer 情境；每列 255 個相鄰階差' : 'Three standard-gamma-2.2 rows plus 12 transfer cases; 255 adjacent intervals per row',
      dataset: 'summary_metrics',
      sourceId: sourceIdForDataset('summary_metrics'),
      defaultSort: { field: 'caseLabel', direction: 'asc' },
      density: 'dense',
      layout: 'full',
      columns: [
        { field: 'caseLabel', label: t.labels.case, type: 'text', sizing: 'content' },
        { field: 'uniqueLevels', label: t.labels.uniqueLevels, format: 'number' },
        { field: 'duplicateTransitions', label: t.labels.plateaus, format: 'number' },
        { field: 'visibleTransitions', label: zh ? '≥1 JND 階差' : 'Intervals ≥1 JND', format: 'number' },
        { field: 'subJndTransitions', label: zh ? '<1 JND 階差' : 'Intervals <1 JND', format: 'number' },
        { field: 'visibleTransitionRatePct', label: zh ? '可辨識率 %' : 'Discernible rate %', format: 'number' },
        { field: 'meanNits', label: zh ? '平均 nit' : 'Mean nit', format: 'number' },
        { field: 'midNits', label: zh ? '輸入 128 nit' : 'Input 128 nit', format: 'number' },
      ],
    },
    {
      id: 'jnd_detail_table',
      title: zh ? 'JND 階差分布與目標誤差' : 'JND-step distribution and target error',
      subtitle: zh ? '標準 Gamma 2.2 三列加 12 個 transfer 情境；相鄰階差以 JND 為單位' : 'Three standard-gamma-2.2 rows plus 12 transfer cases; adjacent intervals in JND units',
      dataset: 'summary_metrics',
      sourceId: sourceIdForDataset('summary_metrics'),
      defaultSort: { field: 'caseLabel', direction: 'asc' },
      density: 'dense',
      layout: 'full',
      columns: [
        { field: 'caseLabel', label: t.labels.case, type: 'text', sizing: 'content' },
        { field: 'jndMean', label: zh ? 'JND 平均' : 'JND mean', format: 'number' },
        { field: 'jndSd', label: t.labels.jndSd, format: 'number' },
        { field: 'jndCv', label: 'JND CV', format: 'number' },
        { field: 'jndMin', label: zh ? 'JND 最小' : 'JND min', format: 'number' },
        { field: 'jndMax', label: zh ? 'JND 最大' : 'JND max', format: 'number' },
        { field: 'rmsJndTargetError', label: zh ? '目標 JND RMSE' : 'Target JND RMSE', format: 'number' },
      ],
    },
    {
      id: 'brightness_table',
      title: zh ? '代表性輸入碼的實體亮度' : 'Physical luminance at representative input codes',
      subtitle: zh ? 'Adobe RGB、補償 0、預設 IPS 1000:1；單位 nit' : 'Adobe RGB, compensation 0, default IPS 1000:1; values in nit',
      dataset: 'brightness_samples',
      sourceId: sourceIdForDataset('brightness_samples'),
      defaultSort: { field: 'inputCode', direction: 'asc' },
      density: 'spacious',
      layout: 'full',
      columns: [
        { field: 'inputCode', label: t.labels.inputCode, format: 'number' },
        { field: 'baselineNits', label: zh ? '標準 Gamma 2.2 nit' : 'Standard gamma 2.2 nit', format: 'number' },
        { field: 'gsdfIdealNits', label: zh ? 'GSDF 理想 nit' : 'GSDF ideal nit', format: 'number' },
        { field: 'gsdf8Nits', label: 'GSDF 8-bit nit', format: 'number' },
        { field: 'gsdf10Nits', label: 'GSDF 10-bit nit', format: 'number' },
        { field: 'csdfIdealNits', label: zh ? 'CSDF 理想 nit' : 'CSDF ideal nit', format: 'number' },
        { field: 'csdf8Nits', label: 'CSDF 8-bit nit', format: 'number' },
        { field: 'csdf10Nits', label: 'CSDF 10-bit nit', format: 'number' },
      ],
    },
  ];

  const blocks = [
    { id: 'title', type: 'markdown', body: `# ${t.title}` },
    { id: 'technical_summary', type: 'markdown', body: narrative.technicalSummary },
    { id: 'mapping_intro', type: 'markdown', body: narrative.mappingIntro },
    { id: 'mapping_chart', type: 'chart', chartId: 'mapping_curve', layout: 'full' },
    { id: 'jnd_intro', type: 'markdown', body: narrative.jndIntro },
    { id: 'jnd_chart', type: 'chart', chartId: 'jnd_curve', layout: 'full' },
    { id: 'quant_intro', type: 'markdown', body: narrative.quantIntro },
    { id: 'unique_levels_chart_block', type: 'chart', chartId: 'unique_levels_chart', layout: 'full' },
    { id: 'jnd_sd_intro', type: 'markdown', body: narrative.jndSdIntro },
    { id: 'jnd_sd_chart_block', type: 'chart', chartId: 'jnd_sd_chart', layout: 'full' },
    { id: 'plateau_intro', type: 'markdown', body: narrative.plateauIntro },
    { id: 'plateau_chart_block', type: 'chart', chartId: 'plateau_chart', layout: 'full' },
    { id: 'gamma_intro', type: 'markdown', body: narrative.gammaIntro },
    { id: 'gamma_chart_block', type: 'chart', chartId: 'gamma_sensitivity_chart', layout: 'full' },
    { id: 'exact_stats_intro', type: 'markdown', body: narrative.exactStatsIntro },
    { id: 'summary_table_block', type: 'table', tableId: 'summary_table', layout: 'full' },
    { id: 'jnd_detail_intro', type: 'markdown', body: narrative.jndDetailIntro },
    { id: 'jnd_detail_table_block', type: 'table', tableId: 'jnd_detail_table', layout: 'full' },
    { id: 'brightness_intro', type: 'markdown', body: narrative.brightnessIntro },
    { id: 'brightness_table_block', type: 'table', tableId: 'brightness_table', layout: 'full' },
    { id: 'scope', type: 'markdown', body: narrative.scope },
    { id: 'methodology', type: 'markdown', body: narrative.methodology },
    { id: 'limitations', type: 'markdown', body: narrative.limitations },
    { id: 'recommendations', type: 'markdown', body: narrative.recommendations },
    { id: 'further_questions', type: 'markdown', body: narrative.further },
  ];

  const sources = Object.entries(DATASET_SQL).map(([datasetId, sql]) => ({
    id: sourceIdForDataset(datasetId),
    label: zh ? `位深分析資料：${datasetId}` : `Bit-depth analysis dataset: ${datasetId}`,
    path: 'scripts/analyzeGsdfCsdfBitDepth.mjs',
    query: {
      engine: 'node:sqlite',
      language: 'sql',
      sql,
      description: zh
        ? `從記憶體 SQLite 資料表 ${datasetId} 讀取由目前 tone-curve 模型計算的已審查資料。`
        : `Reads reviewed rows calculated by the current tone-curve model from the in-memory SQLite table ${datasetId}.`,
      executed_at: generatedAt,
      tables_used: [datasetId],
    },
  }));

  return {
    surface: 'report',
    manifest: {
      version: 1,
      surface: 'report',
      title: t.title,
      description: t.description,
      generatedAt,
      cards,
      charts,
      tables,
      sources: sources.map(({ id, label, path }) => ({ id, label, path })),
      blocks,
    },
    snapshot: {
      version: 1,
      generatedAt,
      status: 'ready',
      datasets,
    },
    sources,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const toneModule = await loadBundledModule('src/color/buildToneCurveSnapshot.ts');
  const luminanceModule = await loadBundledModule('src/color/perceptualLuminance.ts');
  const analysis = buildAnalysis(toneModule, luminanceModule);
  const artifact = buildArtifact(options.locale, options.generatedAt, analysis);
  const outputPath = resolveRepositoryOutput(options.output ?? DEFAULT_OUTPUTS[options.locale]);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  const gsdf8 = curveFor(analysis, 'neutral', 'GSDF', '8-bit').metrics;
  const standardGamma8 = curveFor(analysis, 'neutral', 'Baseline', '8-bit').metrics;
  const csdf8 = curveFor(analysis, 'neutral', 'CSDF', '8-bit').metrics;
  const gsdf10 = curveFor(analysis, 'neutral', 'GSDF', '10-bit').metrics;
  console.log(JSON.stringify({
    locale: options.locale,
    output: relative(repositoryRoot, outputPath).replaceAll('\\', '/'),
    generatedAt: options.generatedAt,
    display: snapshotFor(analysis, 'neutral', 'GSDF').metadata,
    identityDelta: analysis.identityDelta,
    roundedSnapshotIdentityDelta: analysis.roundedSnapshotIdentityDelta,
    adobeVsSrgbRemapDelta: analysis.adobeVsSrgbRemapDelta,
    jndRange: analysis.jndRange,
    standardGamma8,
    gsdf8,
    csdf8,
    gsdf10,
  }, null, 2));
}

await main();
