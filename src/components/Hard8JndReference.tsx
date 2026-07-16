import React from 'react';
import type { Messages } from '../i18n';
import type { AppSettings } from '../types';
import {
  buildHard8JndOptimizationModel,
} from '../color/hard8JndOptimization';

const CHART_WIDTH = 260;
const CHART_HEIGHT = 64;
const CHART_TOP = 4;
const CHART_BOTTOM = 60;

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

function formatSignedDelta(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function Hard8JndReference({ settings, messages }: { settings: AppSettings; messages: Messages }) {
  const model = React.useMemo(
    () => buildHard8JndOptimizationModel(settings, settings.hard8JndLevelCount),
    [settings],
  );
  const yMaximum = Math.ceil(Math.max(
    3,
    model.current.nonzeroJndStepMax,
    model.optimized.nonzeroJndStepMax,
  ) * 10) / 10;
  const currentPoints = buildPolyline(model.current.jndSteps, yMaximum);
  const optimizedPoints = buildPolyline(model.optimized.jndSteps, yMaximum);
  const oneJndY = CHART_BOTTOM - (1 / yMaximum) * (CHART_BOTTOM - CHART_TOP);
  const retainedDelta = (
    (model.optimized.nonzeroJndStepSd - model.current.nonzeroJndStepSd)
    / model.current.nonzeroJndStepSd
  ) * 100;
  const allStepDelta = (
    (model.optimized.allJndStepSd - model.current.allJndStepSd)
    / model.current.allJndStepSd
  ) * 100;
  const currentLabel = `${messages.panel.hard8ReferenceCurrent} ${model.transferFormula.toUpperCase()}`;
  const optimizedLabel = `${model.levelCount} ${messages.panel.hard8ReferenceOptimized}`;
  const blackNits = model.displayBlackNits < 0.1
    ? model.displayBlackNits.toFixed(3)
    : model.displayBlackNits.toFixed(1);

  return (
    <section className="gsdf-hard8-reference" aria-labelledby="gsdf-hard8-reference-title">
      <div className="gsdf-hard8-reference__header">
        <div className="min-w-0">
          <h3 id="gsdf-hard8-reference-title" className="gsdf-hard8-reference__title">
            {messages.panel.hard8ReferenceTitle}
          </h3>
          <p className="gsdf-hard8-reference__subtitle">
            {model.displayGamut.toUpperCase()} · {blackNits}–{model.displayWhiteNits.toFixed(0)} nit · γ{model.displayGamma}
          </p>
        </div>
        <span className="gsdf-hard8-reference__mode">8 BIT</span>
      </div>

      <div className="gsdf-hard8-reference__chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${messages.panel.hard8ReferenceChartAria} ${model.levelCount}`}
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
          {currentLabel}
        </span>
        <span>
          <i className="gsdf-hard8-reference__key gsdf-hard8-reference__key--optimized" />
          {optimizedLabel}
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
        <span>{formatSignedDelta(retainedDelta)} {messages.panel.hard8ReferenceRetained}</span>
        <span>{formatSignedDelta(allStepDelta)} {messages.panel.hard8ReferenceAll}</span>
      </p>
    </section>
  );
}
