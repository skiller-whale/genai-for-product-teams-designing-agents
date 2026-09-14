import { useEffect, useMemo, useState } from 'react';
import type { CaseResult, CostBudgetLevel, EvalCaseSummary, EvalRun, Mode } from '../../shared/types';
import {
  budgetLevelReached,
  costUsd,
  formatCost,
  formatTokens,
  nextBudgetLevel,
} from '../../shared/pricing';
import * as api from '../api';
import { StepList } from './StepList';
import { TokenBadge } from './TokenBadge';

interface Props {
  active: boolean;
  mode: Mode;
}

const BLOCK_INTRO: Record<Mode, string> = {
  investigation: 'Read each case and its checks before running the evals.',
  tools: 'Every case needs an ability the bare model lacks. Choose only the tools each one needs.',
  prompt: 'The judge scores each reply against your chosen tone brief.',
  rules: 'Behaviour problems, from easy to hard. Fix them with instructions in the system prompt.',
  skills: 'The ambitious set: multi-step policy questions that want a written procedure.',
  cost: 'Wide-ranging questions that invite long answers. Keep every case passing — under budget.',
};

export function EvalsPane({ active, mode }: Props) {
  const [cases, setCases] = useState<EvalCaseSummary[]>([]);
  const [tonePassThreshold, setTonePassThreshold] = useState(70);
  const [costBudgetLevels, setCostBudgetLevels] = useState<CostBudgetLevel[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  // caseId → 'running' while a run is in flight (results land in `latest`).
  const [running, setRunning] = useState<Set<string> | null>(null);
  // The most recent result per case, updated live as results stream in.
  const [latest, setLatest] = useState<Record<string, CaseResult>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCases()
      .then((r) => {
        setCases(r.cases);
        setTonePassThreshold(r.tonePassThreshold);
        setCostBudgetLevels(r.costBudgetLevels);
      })
      .catch((err) => setError(err.message));
    api
      .getRuns()
      .then((r) => {
        setRuns(r.runs);
        setLatest(latestResults(r.runs));
      })
      .catch((err) => setError(err.message));
  }, []);

  // An open case detail belongs to the mode it was opened in.
  useEffect(() => setSelected(null), [mode]);

  const blockCases = useMemo(() => cases.filter((c) => c.block === mode), [cases, mode]);
  const blockRuns = useMemo(() => runs.filter((r) => r.block === mode), [runs, mode]);

  const startRun = async (caseIds?: string[]) => {
    if (running) return;
    setError(null);
    const included = caseIds ?? blockCases.map((c) => c.id);
    setRunning(new Set(included));
    try {
      await api.streamEvals(mode, caseIds, (event) => {
        if (event.type === 'case_result') {
          setLatest((current) => ({ ...current, [event.result.caseId]: event.result }));
          setRunning((current) => {
            if (!current) return current;
            const next = new Set(current);
            next.delete(event.result.caseId);
            return next;
          });
        } else if (event.type === 'run_complete') {
          setRuns((r) => [...r, event.run]);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('Clear all eval run history?')) return;
    await api.clearHistory();
    setRuns([]);
    setLatest({});
    setSelected(null);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Aggregate of the latest result per case in this block.
  const blockLatest = blockCases
    .map((c) => latest[c.id])
    .filter((r): r is CaseResult => r !== undefined);
  const allGraded = blockLatest.length === blockCases.length && blockCases.length > 0;
  const passedCount = blockLatest.filter((r) => r.passed).length;
  const latestCost = blockLatest.reduce((total, r) => total + costUsd(r.usage), 0);
  const scores = blockLatest.map((r) => r.score).filter((s): s is number => s !== undefined);
  const averageScore =
    scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // The budget ladder: the top level is the core task, the rest are stretch
  // goals. `reachedLevel` is the tightest one this run came in under.
  const topBudget = costBudgetLevels[0]?.usd ?? 0;
  const reachedLevel = budgetLevelReached(costBudgetLevels, latestCost);
  const stretchLevel = nextBudgetLevel(costBudgetLevels, latestCost);

  const selectedResult = selected ? latest[selected] : null;
  const selectedCase = selected ? cases.find((c) => c.id === selected) : null;

  if (!active && !running) {
    // Stay mounted (to keep a run going while the learner chats) but skip
    // rendering work when hidden and idle.
  }

  return (
    <div className="evals-pane">
      <p className="evals-intro">{BLOCK_INTRO[mode]}</p>

      <div className="evals-controls">
        <button className="btn-run" onClick={() => startRun()} disabled={!!running}>
          ▶ Run this block ({blockCases.length})
        </button>
        {running && running.size > 0 && (
          <span className="evals-running">Running {running.size} case{running.size === 1 ? '' : 's'}…</span>
        )}
        {blockLatest.length > 0 && (
          <span className="evals-summary" data-testid="evals-summary">
            {passedCount}/{blockLatest.length} passing
            {averageScore !== null && <> · average tone score <strong>{averageScore}%</strong></>}
            {mode === 'cost' && <> · {formatCost(latestCost)}</>}
          </span>
        )}
        {error && <span className="chat-error">⚠️ {error}</span>}
      </div>

      {mode === 'cost' && topBudget > 0 && allGraded && (
        <div className="cost-budget" data-testid="cost-budget">
          <div className="cost-budget-bar">
            <div
              className={`cost-budget-fill ${latestCost <= topBudget ? 'under' : 'over'}`}
              style={{ width: `${Math.min(100, (latestCost / topBudget) * 100)}%` }}
            />
            {/* The top level is the end of the bar, so only the stretch levels
                need a line of their own. */}
            {costBudgetLevels
              .filter((level) => level.usd < topBudget)
              .map((level) => (
                <div
                  key={level.name}
                  className={`cost-budget-level ${level === reachedLevel ? 'reached' : ''}`}
                  style={{ left: `${(level.usd / topBudget) * 100}%` }}
                  title={`${level.name} — ${formatCost(level.usd)}`}
                />
              ))}
          </div>
          <div className="cost-budget-scale">
            {costBudgetLevels.map((level) => (
              <span
                key={level.name}
                className={`cost-budget-tick ${level === reachedLevel ? 'reached' : ''}`}
                style={{
                  left: `${(level.usd / topBudget) * 100}%`,
                  transform: level.usd === topBudget ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
              >
                {formatCost(level.usd)}
              </span>
            ))}
          </div>
          <p className="cost-budget-text">
            Latest results cost <strong>{formatCost(latestCost)}</strong>
            {reachedLevel ? (
              <>
                {' '}— under the <strong>{reachedLevel.name}</strong> level (
                {formatCost(reachedLevel.usd)}).{' '}
                {stretchLevel ? (
                  <>
                    Next level down: <strong>{stretchLevel.name}</strong> ({formatCost(stretchLevel.usd)}).
                  </>
                ) : (
                  <>This is the tightest level.</>
                )}
              </>
            ) : (
              <>
                {' '}— over budget ({formatCost(topBudget)}).
              </>
            )}{' '}
            At 10,000 conversations a day, this agent would cost roughly{' '}
            <strong>{formatCost((latestCost / blockLatest.length) * 10_000 * 365)}</strong> a year.
          </p>
        </div>
      )}

      <ul className="case-list">
        {blockCases.map((c) => {
          const result = latest[c.id];
          const isRunning = running?.has(c.id) ?? false;
          const isExpanded = expanded.has(c.id);
          return (
            <li key={c.id} className="case-card">
              <div className={`case-row ${isRunning ? 'running' : result ? (result.passed ? 'pass' : 'fail') : ''}`}>
                <button
                  className="case-main"
                  onClick={() => toggleExpanded(c.id)}
                  title={isExpanded ? 'Hide the checks' : 'Show the checks'}
                >
                  <span className="case-status">
                    {isRunning ? '⏳' : result ? (result.passed ? '✓' : '✗') : '·'}
                  </span>
                  <span className="case-name">
                    {c.name}
                    {result?.score !== undefined && (
                      <span className={`case-score ${result.passed ? 'pass' : 'fail'}`}>{result.score}%</span>
                    )}
                  </span>
                  <span className="case-chevron">{isExpanded ? '▾' : '▸'}</span>
                </button>
                <div className="case-actions">
                  {result && (
                    <button className="btn-case-detail" onClick={() => setSelected(c.id)}>
                      Details
                    </button>
                  )}
                  <button
                    className="btn-case-rerun"
                    title="Run just this case"
                    disabled={!!running}
                    onClick={() => startRun([c.id])}
                  >
                    ↻ Run
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="case-expanded">
                  <p className="case-input">
                    <strong>Customer:</strong> {c.input}
                  </p>
                  <ul className="case-checks">
                    {c.checks.map((check, i) => (
                      <li key={i}>{check}</li>
                    ))}
                  </ul>
                  {result && !result.passed && result.failures.length > 0 && (
                    <ul className="case-detail-failures">
                      {result.failures.map((f, i) => (
                        <li key={i}>✗ {f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {selectedResult && selectedCase && (
        <div className="case-detail">
          <div className="case-detail-header">
            <h3>
              {selectedResult.passed ? '✓' : '✗'} {selectedResult.name}
              {selectedResult.score !== undefined && (
                <span className={`case-score ${selectedResult.passed ? 'pass' : 'fail'}`}>
                  {selectedResult.score}% (pass at {tonePassThreshold}%)
                </span>
              )}
            </h3>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
          <p className="case-detail-input">
            <strong>Customer:</strong> {selectedCase.input}
          </p>
          {selectedResult.failures.length > 0 && (
            <ul className="case-detail-failures">
              {selectedResult.failures.map((f, i) => (
                <li key={i}>✗ {f}</li>
              ))}
            </ul>
          )}
          {selectedResult.judge && (
            <p className="case-detail-judge">
              Judge: {selectedResult.judge.verdict} — {selectedResult.judge.reason}
            </p>
          )}
          <h4>What the agent did</h4>
          <StepList steps={selectedResult.transcript} />
          <TokenBadge usage={selectedResult.usage} label="this case (incl. judge)" />
        </div>
      )}

      {blockRuns.length > 0 && (
        <div className="run-history">
          <div className="run-history-header">
            <h3>Run history</h3>
            <button className="btn-clear" onClick={clearHistory} disabled={!!running}>
              Clear history
            </button>
          </div>
          <div className="run-table-scroll">
            <table className="run-table">
              <thead>
                <tr>
                  <th>Case</th>
                  {blockRuns.map((run, index) => (
                    <th key={run.id} title={describeRun(run)}>
                      #{index + 1}
                      {run.results.length < blockCases.length && (
                        <span className="run-col-set">partial</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blockCases.map((c) => (
                  <tr key={c.id}>
                    <td className="run-case-name">{c.name}</td>
                    {blockRuns.map((run, index) => {
                      const result = run.results.find((r) => r.caseId === c.id);
                      const previous = findPrevious(blockRuns, index, c.id);
                      return (
                        <td key={run.id} className={cellClass(result)}>
                          {result
                            ? result.score !== undefined
                              ? `${result.score}%`
                              : result.passed
                                ? '✓'
                                : '✗'
                            : '–'}
                          {delta(previous, result)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="run-totals-row">
                  <td>Passing</td>
                  {blockRuns.map((run) => (
                    <td key={run.id}>
                      {run.totals.passed}/{run.totals.total}
                    </td>
                  ))}
                </tr>
                <tr className="run-totals-row">
                  <td>Tokens</td>
                  {blockRuns.map((run) => (
                    <td key={run.id}>
                      {formatTokens(run.totals.usage.inputTokens + run.totals.usage.outputTokens)}
                    </td>
                  ))}
                </tr>
                <tr className="run-totals-row">
                  <td>Cost (approx.)</td>
                  {blockRuns.map((run) => (
                    <td key={run.id}>{formatCost(run.totals.costUsd)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** The newest result for every case across the whole history. */
function latestResults(runs: EvalRun[]): Record<string, CaseResult> {
  const latest: Record<string, CaseResult> = {};
  for (const run of runs) {
    for (const result of run.results) {
      latest[result.caseId] = result;
    }
  }
  return latest;
}

function describeRun(run: EvalRun): string {
  const { systemPromptChars, toneBrief, ruleCount, skillNames, enabledTools } = run.configSummary;
  const time = new Date(run.startedAt).toLocaleTimeString();
  return [
    `${time} — ${run.results.length} case${run.results.length === 1 ? '' : 's'}`,
    `system prompt: ${systemPromptChars} chars${toneBrief ? ` (tone: ${toneBrief})` : ''}`,
    `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`,
    `skills: ${skillNames.join(', ') || 'none'}`,
    `tools: ${enabledTools.join(', ') || 'none'}`,
  ].join('\n');
}

/** The most recent earlier run that included this case. */
function findPrevious(runs: EvalRun[], index: number, caseId: string): CaseResult | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const result = runs[i].results.find((r) => r.caseId === caseId);
    if (result) return result;
  }
  return undefined;
}

function cellClass(result: CaseResult | undefined): string {
  if (!result) return 'run-cell skip';
  return result.passed ? 'run-cell pass' : 'run-cell fail';
}

function delta(previous: CaseResult | undefined, current: CaseResult | undefined) {
  if (!previous || !current || previous.passed === current.passed) return null;
  return current.passed ? (
    <span className="delta up" title="Newly passing">▲</span>
  ) : (
    <span className="delta down" title="Regressed — this passed before">▼</span>
  );
}
