import React from 'react';
import { CheckCircle2, Power, RotateCcw, Sigma } from 'lucide-react';
import type { Messages } from '../i18n';
import {
  HARD8_JND_LEVEL_MAX,
  HARD8_JND_LEVEL_MIN,
  type AppSettings,
} from '../types';
import { buildHard8JndOptimizationModel } from '../color/hard8JndOptimization';

const CURVE_WIDTH = 320;
const CURVE_HEIGHT = 92;
const CURVE_INSET = 5;
const JND_HEIGHT = 84;

interface Hard8JndOptimizationPanelProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  messages: Messages;
}

function buildTransferPolyline(values: number[]): string {
  const usableWidth = CURVE_WIDTH - CURVE_INSET * 2;
  const usableHeight = CURVE_HEIGHT - CURVE_INSET * 2;
  return values.map((value, index) => {
    const x = CURVE_INSET + (index / (values.length - 1)) * usableWidth;
    const y = CURVE_HEIGHT - CURVE_INSET - value * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function buildJndPolyline(values: number[], yMaximum: number): string {
  const usableWidth = CURVE_WIDTH - CURVE_INSET * 2;
  const usableHeight = JND_HEIGHT - CURVE_INSET * 2;
  return values.map((value, index) => {
    const x = CURVE_INSET + (index / (values.length - 1)) * usableWidth;
    const y = JND_HEIGHT - CURVE_INSET - Math.min(1, value / yMaximum) * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}

function formatDelta(current: number, optimized: number): string {
  if (current === 0) {
    return '0.0%';
  }
  const delta = ((optimized - current) / current) * 100;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `${sign}${Math.abs(delta).toFixed(1)}%`;
}

export function Hard8JndOptimizationPanel({
  settings,
  setSettings,
  messages,
}: Hard8JndOptimizationPanelProps) {
  const model = React.useMemo(
    () => buildHard8JndOptimizationModel(settings, settings.hard8JndLevelCount),
    [settings],
  );
  const transferCurrent = buildTransferPolyline(model.currentCodeRemapNorm);
  const transferOptimized = buildTransferPolyline(model.optimizedCodeRemapNorm);
  const jndMaximum = Math.ceil(Math.max(
    3,
    model.current.nonzeroJndStepMax,
    model.optimized.nonzeroJndStepMax,
  ) * 10) / 10;
  const jndCurrent = buildJndPolyline(model.current.jndSteps, jndMaximum);
  const jndOptimized = buildJndPolyline(model.optimized.jndSteps, jndMaximum);
  const oneJndY = JND_HEIGHT - CURVE_INSET
    - (1 / jndMaximum) * (JND_HEIGHT - CURVE_INSET * 2);
  const currentLabel = `${messages.panel.hard8ReferenceCurrent} ${model.transferFormula.toUpperCase()}`;
  const optimizedLabel = `${model.levelCount} ${messages.panel.hard8ReferenceOptimized}`;

  const setLevelCount = (value: number) => {
    setSettings((previous) => ({
      ...previous,
      hard8JndLevelCount: Math.max(
        HARD8_JND_LEVEL_MIN,
        Math.min(HARD8_JND_LEVEL_MAX, Math.round(value)),
      ),
    }));
  };

  const useRecommendedLevelCount = () => {
    setLevelCount(model.recommendedLevelCount);
  };

  const applyOptimization = () => {
    setSettings((previous) => ({
      ...previous,
      enabled: true,
      hard8JndOptimizationEnabled: true,
    }));
  };

  const disableOptimization = () => {
    setSettings((previous) => ({
      ...previous,
      hard8JndOptimizationEnabled: false,
    }));
  };

  return (
    <section className="gsdf-jnd-workbench" aria-labelledby="gsdf-jnd-workbench-title">
      <header className="gsdf-jnd-workbench__header">
        <div>
          <p className="gsdf-jnd-workbench__eyebrow">HARD 8-BIT / JND</p>
          <h2 id="gsdf-jnd-workbench-title">{messages.panel.hard8OptimizationTitle}</h2>
          <p>{messages.panel.hard8OptimizationBody}</p>
        </div>
        <span
          className="gsdf-jnd-workbench__state"
          data-applied={settings.hard8JndOptimizationEnabled ? 'true' : 'false'}
        >
          {settings.hard8JndOptimizationEnabled
            ? messages.panel.hard8OptimizationApplied
            : messages.panel.hard8OptimizationPreview}
        </span>
      </header>

      <div className="gsdf-jnd-workbench__model-strip">
        <span>{model.displayGamut.toUpperCase()}</span>
        <span>{model.displayBlackNits.toFixed(model.displayBlackNits < 0.1 ? 3 : 1)}–{model.displayWhiteNits.toFixed(0)} nit</span>
        <span>γ{model.displayGamma}</span>
        <span>{model.transferFormula.toUpperCase()}</span>
      </div>

      <div className="gsdf-jnd-workbench__level-control">
        <div className="gsdf-jnd-workbench__level-readout">
          <label htmlFor="gsdf-hard8-jnd-level-count">
            {messages.panel.hard8OptimizationLevelBudget}
          </label>
          <strong>{model.levelCount}</strong>
        </div>
        <input
          id="gsdf-hard8-jnd-level-count"
          name="hard8JndLevelCount"
          type="range"
          min={HARD8_JND_LEVEL_MIN}
          max={HARD8_JND_LEVEL_MAX}
          value={model.levelCount}
          onChange={(event) => setLevelCount(Number(event.currentTarget.value))}
          aria-label={messages.panel.hard8OptimizationLevelBudget}
        />
        <div className="gsdf-jnd-workbench__range-scale" aria-hidden="true">
          <span>{HARD8_JND_LEVEL_MIN}</span>
          <span>{model.recommendedLevelCount} {messages.panel.hard8OptimizationRecommended}</span>
          <span>{HARD8_JND_LEVEL_MAX}</span>
        </div>
        <button
          type="button"
          className="gsdf-jnd-workbench__recommend"
          onClick={useRecommendedLevelCount}
        >
          <Sigma size={12} />
          {messages.panel.hard8OptimizationUseRecommended} {model.recommendedLevelCount}
        </button>
      </div>

      <div className="gsdf-jnd-workbench__chart-block">
        <div className="gsdf-jnd-workbench__chart-heading">
          <span>{messages.panel.hard8OptimizationTransferCurve}</span>
          <span>DDL 0–255</span>
        </div>
        <svg
          className="gsdf-jnd-workbench__chart"
          viewBox={`0 0 ${CURVE_WIDTH} ${CURVE_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={messages.panel.hard8OptimizationTransferCurve}
        >
          <line className="gsdf-jnd-workbench__diagonal" x1={CURVE_INSET} y1={CURVE_HEIGHT - CURVE_INSET} x2={CURVE_WIDTH - CURVE_INSET} y2={CURVE_INSET} />
          <polyline className="gsdf-jnd-workbench__line gsdf-jnd-workbench__line--current" points={transferCurrent} />
          <polyline className="gsdf-jnd-workbench__line gsdf-jnd-workbench__line--optimized" points={transferOptimized} />
        </svg>
      </div>

      <div className="gsdf-jnd-workbench__chart-block">
        <div className="gsdf-jnd-workbench__chart-heading">
          <span>{messages.panel.hard8OptimizationJndCurve}</span>
          <span>ΔJND</span>
        </div>
        <svg
          className="gsdf-jnd-workbench__chart gsdf-jnd-workbench__chart--jnd"
          viewBox={`0 0 ${CURVE_WIDTH} ${JND_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={messages.panel.hard8OptimizationJndCurve}
        >
          <line className="gsdf-jnd-workbench__threshold" x1={CURVE_INSET} x2={CURVE_WIDTH - CURVE_INSET} y1={oneJndY} y2={oneJndY} />
          <polyline className="gsdf-jnd-workbench__line gsdf-jnd-workbench__line--current" points={jndCurrent} />
          <polyline className="gsdf-jnd-workbench__line gsdf-jnd-workbench__line--optimized" points={jndOptimized} />
        </svg>
      </div>

      <div className="gsdf-jnd-workbench__legend" aria-label={messages.panel.hard8ReferenceChartAria}>
        <span><i className="is-current" />{currentLabel}</span>
        <span><i className="is-optimized" />{optimizedLabel}</span>
      </div>

      <dl className="gsdf-jnd-workbench__metrics">
        <div>
          <dt>{messages.panel.hard8ReferenceLevels}</dt>
          <dd>{model.current.uniqueLevels} → {model.optimized.uniqueLevels}</dd>
        </div>
        <div>
          <dt>{messages.panel.hard8ReferenceMerges}</dt>
          <dd>{model.current.mergedTransitions} → {model.optimized.mergedTransitions}</dd>
        </div>
        <div>
          <dt>{messages.panel.hard8ReferenceRetainedSd}</dt>
          <dd>{formatMetric(model.current.nonzeroJndStepSd)} → {formatMetric(model.optimized.nonzeroJndStepSd)}</dd>
          <small>{formatDelta(model.current.nonzeroJndStepSd, model.optimized.nonzeroJndStepSd)}</small>
        </div>
        <div>
          <dt>{messages.panel.hard8ReferenceAllSd}</dt>
          <dd>{formatMetric(model.current.allJndStepSd)} → {formatMetric(model.optimized.allJndStepSd)}</dd>
          <small>{formatDelta(model.current.allJndStepSd, model.optimized.allJndStepSd)}</small>
        </div>
        <div>
          <dt>{messages.panel.hard8OptimizationVisible}</dt>
          <dd>{model.current.discernibleTransitions} → {model.optimized.discernibleTransitions}</dd>
        </div>
        <div>
          <dt>{messages.panel.hard8OptimizationSubJnd}</dt>
          <dd>{model.current.subJndTransitions} → {model.optimized.subJndTransitions}</dd>
        </div>
      </dl>

      <div className="gsdf-jnd-workbench__actions">
        <button type="button" className="is-primary" onClick={applyOptimization}>
          <CheckCircle2 size={13} />
          {messages.panel.hard8OptimizationApply}
        </button>
        <button type="button" onClick={disableOptimization} disabled={!settings.hard8JndOptimizationEnabled}>
          {settings.hard8JndOptimizationEnabled ? <Power size={13} /> : <RotateCcw size={13} />}
          {messages.panel.hard8OptimizationDisable}
        </button>
      </div>

      <p className="gsdf-jnd-workbench__note">{messages.panel.hard8OptimizationNote}</p>
    </section>
  );
}
