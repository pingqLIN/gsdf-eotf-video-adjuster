import React from 'react';
import type { Messages } from '../i18n';
import { buildToneCurveSnapshot } from '../types';
import {
  analyzeHard8DeviceCodeMapping,
  buildHard8DeviceJndIndex,
  expandHard8JndLevelsToInputMapping,
  optimizeHard8JndDeviceLevels,
  type Hard8JndStatistics,
} from '../color/hard8JndOptimization';

const CHART_WIDTH = 260;
const CHART_HEIGHT = 64;
const CHART_TOP = 4;
const CHART_BOTTOM = 60;

interface Hard8ReferenceModel {
  current: Hard8JndStatistics;
  optimized: Hard8JndStatistics;
  yMaximum: number;
}

let cachedReferenceModel: Hard8ReferenceModel | null = null;

function buildReferenceModel(): Hard8ReferenceModel {
  const snapshot = buildToneCurveSnapshot({
    lmax: 100,
    gammaTarget: 2.2,
    displayGamma: 2.2,
    transferFormula: 'gsdf',
    displayGamut: 'adobe-rgb',
    strength: 100,
    blackPoint: 0,
    whitePoint: 256,
  }, {
    tableSize: 256,
    displayPreset: 'ips-1000',
    digits: 8,
  });
  const deviceJndIndex = buildHard8DeviceJndIndex({
    blackNits: snapshot.metadata.displayBlackNits,
    whiteNits: snapshot.metadata.displayWhiteNits,
    displayGamma: snapshot.metadata.displayGamma,
  });
  const currentCodes = snapshot.codeRemapNorm.map((value) => Math.round(value * 255));
  const current = analyzeHard8DeviceCodeMapping(currentCodes, deviceJndIndex);
  const selectedCodes = optimizeHard8JndDeviceLevels(deviceJndIndex, current.uniqueLevels);
  const optimizedCodes = expandHard8JndLevelsToInputMapping(selectedCodes, 256);
  const optimized = analyzeHard8DeviceCodeMapping(optimizedCodes, deviceJndIndex);
  const yMaximum = Math.ceil(Math.max(
    3,
    current.nonzeroJndStepMax,
    optimized.nonzeroJndStepMax,
  ) * 10) / 10;

  return { current, optimized, yMaximum };
}

function getReferenceModel(): Hard8ReferenceModel {
  cachedReferenceModel ??= buildReferenceModel();
  return cachedReferenceModel;
}

function buildPolyline(values: number[], yMaximum: number): string {
  const chartHeight = CHART_BOTTOM - CHART_TOP;
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * CHART_WIDTH;
    const y = CHART_BOTTOM - Math.min(1, value / yMaximum) * chartHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}

export function Hard8JndReference({ messages }: { messages: Messages }) {
  const model = React.useMemo(getReferenceModel, []);
  const currentPoints = buildPolyline(model.current.jndSteps, model.yMaximum);
  const optimizedPoints = buildPolyline(model.optimized.jndSteps, model.yMaximum);
  const oneJndY = CHART_BOTTOM - (1 / model.yMaximum) * (CHART_BOTTOM - CHART_TOP);
  const retainedImprovement = (
    (model.current.nonzeroJndStepSd - model.optimized.nonzeroJndStepSd)
    / model.current.nonzeroJndStepSd
  ) * 100;
  const allStepImprovement = (
    (model.current.allJndStepSd - model.optimized.allJndStepSd)
    / model.current.allJndStepSd
  ) * 100;

  return (
    <section className="gsdf-hard8-reference" aria-labelledby="gsdf-hard8-reference-title">
      <div className="gsdf-hard8-reference__header">
        <div className="min-w-0">
          <h3 id="gsdf-hard8-reference-title" className="gsdf-hard8-reference__title">
            {messages.panel.hard8ReferenceTitle}
          </h3>
          <p className="gsdf-hard8-reference__subtitle">
            {messages.panel.hard8ReferenceSubtitle}
          </p>
        </div>
        <span className="gsdf-hard8-reference__mode">8 BIT</span>
      </div>

      <div className="gsdf-hard8-reference__chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={messages.panel.hard8ReferenceChartAria}
        >
          <line
            className="gsdf-hard8-reference__threshold"
            x1="0"
            x2={CHART_WIDTH}
            y1={oneJndY}
            y2={oneJndY}
          />
          <polyline
            className="gsdf-hard8-reference__line gsdf-hard8-reference__line--current"
            points={currentPoints}
          />
          <polyline
            className="gsdf-hard8-reference__line gsdf-hard8-reference__line--optimized"
            points={optimizedPoints}
          />
        </svg>
        <span className="gsdf-hard8-reference__threshold-label">1 JND</span>
      </div>

      <div className="gsdf-hard8-reference__legend" aria-hidden="true">
        <span>
          <i className="gsdf-hard8-reference__key gsdf-hard8-reference__key--current" />
          {messages.panel.hard8ReferenceCurrent}
        </span>
        <span>
          <i className="gsdf-hard8-reference__key gsdf-hard8-reference__key--optimized" />
          {messages.panel.hard8ReferenceOptimized}
        </span>
      </div>

      <dl className="gsdf-hard8-reference__metrics">
        <div>
          <dt>{messages.panel.hard8ReferenceLevels}</dt>
          <dd>{model.optimized.uniqueLevels}</dd>
        </div>
        <div>
          <dt>{messages.panel.hard8ReferenceMerges}</dt>
          <dd>{model.optimized.mergedTransitions}</dd>
        </div>
        <div>
          <dt>{messages.panel.hard8ReferenceRetainedSd}</dt>
          <dd>{formatMetric(model.current.nonzeroJndStepSd)} → {formatMetric(model.optimized.nonzeroJndStepSd)}</dd>
        </div>
        <div>
          <dt>{messages.panel.hard8ReferenceAllSd}</dt>
          <dd>{formatMetric(model.current.allJndStepSd)} → {formatMetric(model.optimized.allJndStepSd)}</dd>
        </div>
      </dl>

      <p className="gsdf-hard8-reference__improvement">
        <span>−{retainedImprovement.toFixed(1)}% {messages.panel.hard8ReferenceRetained}</span>
        <span>−{allStepImprovement.toFixed(1)}% {messages.panel.hard8ReferenceAll}</span>
      </p>
    </section>
  );
}
