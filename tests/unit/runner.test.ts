import { describe, expect, test } from 'bun:test';
import type { AIProvider, ConverseResult } from '../../src/server/ai';
import { baselineConfig } from '../../src/server/config/store';
import { runEvals } from '../../src/server/evals/runner';
import { casesForBlock } from '../../src/server/evals/cases';
import type { EvalEvent } from '../../src/shared/types';

// A provider that answers everything with the same text and never uses tools:
// fast, deterministic, and guaranteed to fail most cases — which is exactly
// what we need to test the plumbing (not the model). Judge calls (recognised
// by their system prompts) get well-formed JSON back.
function makeProvider(toneScore = 85): AIProvider {
  return {
    async converse({ system }): Promise<ConverseResult> {
      let text = 'The Full-Day Orca Odyssey lasts 6 hours and costs £120.';
      if (system?.includes('tone-of-voice brief')) {
        text = `{"score": ${toneScore}, "reason": "Sounds the part."}`;
      } else if (system?.includes('grading one reply')) {
        text = '{"verdict": "PASS", "reason": "Fine."}';
      }
      return {
        content: [{ type: 'text', text }],
        stopReason: 'end_turn',
        usage: { inputTokens: 50, outputTokens: 10 },
      };
    },
  };
}

describe('runEvals', () => {
  test('runs a whole block and reports it in case order', async () => {
    const run = await runEvals({
      provider: makeProvider(),
      config: baselineConfig(),
      block: 'investigation',
    });
    expect(run.block).toBe('investigation');
    expect(run.results.map((r) => r.caseId)).toEqual(
      casesForBlock('investigation').map((c) => c.id),
    );
  });

  test('caseIds narrows the run to a single case (the rerun button)', async () => {
    const run = await runEvals({
      provider: makeProvider(),
      config: baselineConfig(),
      block: 'investigation',
      caseIds: ['inv-tour-facts'],
    });
    expect(run.results.map((r) => r.caseId)).toEqual(['inv-tour-facts']);
    expect(run.totals.total).toBe(1);
  });

  test('grading works end to end: the flat answer passes tour facts and fails booking lookup', async () => {
    const run = await runEvals({
      provider: makeProvider(),
      config: baselineConfig(),
      block: 'investigation',
      caseIds: ['inv-tour-facts', 'inv-booking-paid'],
    });
    const byId = Object.fromEntries(run.results.map((r) => [r.caseId, r]));
    expect(byId['inv-tour-facts'].passed).toBe(true);
    expect(byId['inv-booking-paid'].passed).toBe(false);
    expect(byId['inv-booking-paid'].failures.join(' ')).toContain('lookup_booking');
  });

  test('tone-scored cases fail fast without a brief, spending no tokens', async () => {
    const run = await runEvals({
      provider: makeProvider(),
      config: baselineConfig(),
      block: 'prompt',
      caseIds: ['tone-terse'],
    });
    expect(run.results[0].passed).toBe(false);
    expect(run.results[0].failures.join(' ')).toContain('tone brief');
    expect(run.totals.usage.inputTokens).toBe(0);
  });

  test('tone-scored cases record the score and pass at the threshold', async () => {
    const config = { ...baselineConfig(), toneBrief: 'old-salt' };
    const passing = await runEvals({
      provider: makeProvider(85),
      config,
      block: 'prompt',
      caseIds: ['tone-terse'],
    });
    expect(passing.results[0].score).toBe(85);
    expect(passing.results[0].passed).toBe(true);

    const failing = await runEvals({
      provider: makeProvider(40),
      config,
      block: 'prompt',
      caseIds: ['tone-terse'],
    });
    expect(failing.results[0].score).toBe(40);
    expect(failing.results[0].passed).toBe(false);
    expect(failing.results[0].failures.join(' ')).toContain('40%');
  });

  test('totals add up and events stream one result per case', async () => {
    const events: EvalEvent[] = [];
    const run = await runEvals({
      provider: makeProvider(),
      config: baselineConfig(),
      block: 'tools',
      onEvent: (e) => {
        events.push(e);
      },
    });
    const blockSize = casesForBlock('tools').length;
    expect(run.totals.total).toBe(blockSize);
    expect(run.totals.passed).toBe(run.results.filter((r) => r.passed).length);
    expect(run.totals.usage.inputTokens).toBeGreaterThan(0);
    expect(run.totals.costUsd).toBeGreaterThan(0);

    expect(events.filter((e) => e.type === 'case_result')).toHaveLength(blockSize);
    expect(events[0].type).toBe('run_started');
    expect(events[events.length - 1].type).toBe('run_complete');
  });

  test('config summary snapshots what the run was made with', async () => {
    const config = {
      systemPrompt: 'You are Finn.',
      toneBrief: 'concierge' as string | null,
      rules: ['Be brief.'],
      skills: [{ name: 'refunds', description: 'd', body: 'b' }],
      enabledTools: ['search_knowledge_base', 'calculator'],
    };
    const run = await runEvals({
      provider: makeProvider(),
      config,
      block: 'investigation',
      caseIds: ['inv-tour-facts'],
    });
    expect(run.configSummary).toEqual({
      systemPromptChars: 'You are Finn.'.length,
      toneBrief: 'concierge',
      ruleCount: 1,
      skillNames: ['refunds'],
      enabledTools: ['search_knowledge_base', 'calculator'],
    });
  });
});
