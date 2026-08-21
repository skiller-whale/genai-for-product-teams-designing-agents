import type {
  AgentConfig,
  CaseResult,
  ConfigSummary,
  EvalEvent,
  EvalRun,
  Mode,
} from '../../shared/types';
import { EMPTY_USAGE, addUsage } from '../../shared/types';
import { costUsd } from '../../shared/pricing';
import type { AIProvider } from '../ai';
import { runAgent } from '../agent/loop';
import { getToneBrief } from '../scenario/toneBriefs';
import { TONE_PASS_THRESHOLD, casesForBlock, type EvalCase } from './cases';
import { checkAssertions } from './assertions';
import { judgeAnswer, scoreTone } from './judge';

// How many cases run at once. Higher is faster but each case is a full agent
// run of several LLM calls, and a classroom of learners shares the proxy.
const CONCURRENCY = 3;

export interface RunEvalsOptions {
  provider: AIProvider;
  config: AgentConfig;
  block: Mode;
  /** Run only these cases from the block (the per-case rerun button).
   * Omitted or empty means the whole block. */
  caseIds?: string[];
  onEvent?: (event: EvalEvent) => void | Promise<void>;
}

async function runCase(
  provider: AIProvider,
  config: AgentConfig,
  evalCase: EvalCase,
): Promise<CaseResult> {
  // Tone-scored cases need a brief to score against — fail fast without one,
  // before spending any tokens.
  if (evalCase.toneScored && !getToneBrief(config.toneBrief)) {
    return {
      caseId: evalCase.id,
      name: evalCase.name,
      passed: false,
      failures: ['No tone brief selected — pick one in the System prompt section first.'],
      answer: '',
      transcript: [],
      usage: EMPTY_USAGE,
    };
  }

  let result: CaseResult;
  try {
    const run = await runAgent({
      provider,
      config,
      messages: [{ role: 'user', content: [{ type: 'text', text: evalCase.input }] }],
    });

    const failures = checkAssertions(evalCase.assertions, run.finalText, run.transcript);
    let usage = run.usage;
    let judge;
    let score: number | undefined;

    if (evalCase.rubric) {
      const outcome = await judgeAnswer(provider, evalCase.input, run.finalText, evalCase.rubric);
      judge = outcome.verdict;
      usage = addUsage(usage, outcome.usage);
      if (judge.verdict === 'FAIL') {
        failures.push(`Judge: ${judge.reason}`);
      }
    }

    if (evalCase.toneScored) {
      const brief = getToneBrief(config.toneBrief)!;
      const outcome = await scoreTone(provider, evalCase.input, run.finalText, brief);
      score = outcome.score;
      usage = addUsage(usage, outcome.usage);
      const passed = outcome.score >= TONE_PASS_THRESHOLD;
      judge = {
        verdict: passed ? ('PASS' as const) : ('FAIL' as const),
        reason: outcome.reason,
      };
      if (!passed) {
        failures.push(
          `Tone score ${outcome.score}% — below the ${TONE_PASS_THRESHOLD}% bar. ${outcome.reason}`,
        );
      }
    }

    result = {
      caseId: evalCase.id,
      name: evalCase.name,
      passed: failures.length === 0,
      failures,
      judge,
      score,
      answer: run.finalText,
      transcript: run.transcript,
      usage,
    };
  } catch (err) {
    result = {
      caseId: evalCase.id,
      name: evalCase.name,
      passed: false,
      failures: [`The agent run failed: ${err instanceof Error ? err.message : String(err)}`],
      answer: '',
      transcript: [],
      usage: EMPTY_USAGE,
    };
  }
  return result;
}

export function summariseConfig(config: AgentConfig): ConfigSummary {
  return {
    systemPromptChars: config.systemPrompt.length,
    toneBrief: config.toneBrief,
    ruleCount: config.rules.length,
    skillNames: config.skills.map((s) => s.name),
    enabledTools: [...config.enabledTools],
  };
}

/** Run a block of eval cases (or a subset of it) with limited concurrency,
 * emitting one event per finished case so the UI can fill in live, and
 * return the completed run. */
export async function runEvals(options: RunEvalsOptions): Promise<EvalRun> {
  const { provider, config, block, caseIds, onEvent } = options;
  const emit = async (event: EvalEvent) => {
    if (onEvent) await onEvent(event);
  };

  const blockCases = casesForBlock(block);
  const cases =
    caseIds && caseIds.length > 0 ? blockCases.filter((c) => caseIds.includes(c.id)) : blockCases;
  const runId = `run-${Date.now()}`;
  await emit({
    type: 'run_started',
    runId,
    cases: cases.map(({ id, name, block: caseBlock, input }) => ({
      id,
      name,
      block: caseBlock,
      input,
      checks: [],
    })),
  });

  const results: CaseResult[] = [];
  let nextIndex = 0;
  const worker = async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= cases.length) return;
      const result = await runCase(provider, config, cases[index]);
      results.push(result);
      await emit({ type: 'case_result', result });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cases.length) }, () => worker()),
  );

  // Report results in case order, not completion order.
  const ordered = cases
    .map((c) => results.find((r) => r.caseId === c.id))
    .filter((r): r is CaseResult => r !== undefined);
  const usage = ordered.reduce((total, r) => addUsage(total, r.usage), EMPTY_USAGE);
  const run: EvalRun = {
    id: runId,
    startedAt: new Date().toISOString(),
    block,
    configSummary: summariseConfig(config),
    results: ordered,
    totals: {
      passed: ordered.filter((r) => r.passed).length,
      total: ordered.length,
      usage,
      costUsd: costUsd(usage),
    },
  };
  await emit({ type: 'run_complete', run });
  return run;
}
