import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { CaseResult, EvalRun, LearnerView } from '../../src/shared/types';
import { toolInfos } from '../../src/server/agent/tools';
import { baselineConfig, investigationPreset } from '../../src/server/config/store';
import { coachSummary, type SummaryInput } from '../../src/server/coach/summary';
import { COACH_FILE, watchUrl, writeCoachFile } from '../../src/server/coach/syncFile';
import { getView, resetView, setViewKey } from '../../src/server/coach/view';
import { COST_BUDGET_LEVELS, TONE_PASS_THRESHOLD, caseSummaries } from '../../src/server/evals/cases';
import { SIMULATED_DATE } from '../../src/server/scenario';
import { TONE_BRIEFS } from '../../src/server/scenario/toneBriefs';
import routes from '../../src/server/routes';

const USAGE = { inputTokens: 1000, outputTokens: 200 };

function result(caseId: string, passed: boolean, extra: Partial<CaseResult> = {}): CaseResult {
  return {
    caseId,
    name: caseId,
    passed,
    failures: passed ? [] : ['The reply must mention "Kipper Lane".'],
    answer: '',
    transcript: [],
    usage: USAGE,
    ...extra,
  };
}

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
  return {
    watchUrl: 'https://vm1-port-1001.proxy.example.com/watch',
    now: new Date('2026-07-14T10:15:30Z'),
    mode: 'tools',
    config: { ...baselineConfig(), enabledTools: ['search_knowledge_base'] },
    runs: [],
    view: {},
    tools: toolInfos(),
    cases: caseSummaries(),
    toneBriefs: TONE_BRIEFS,
    simulatedDate: SIMULATED_DATE,
    tonePassThreshold: TONE_PASS_THRESHOLD,
    costBudgetLevels: COST_BUDGET_LEVELS,
    ...overrides,
  };
}

describe('watchUrl', () => {
  test("points at the VM's exposed-port proxy host, on the /watch page", () => {
    expect(watchUrl({ SW_HOSTNAME: 'abc123.proxy.eu-west-1.sw-dev-environments.com' })).toBe(
      'https://abc123-port-1001.proxy.eu-west-1.sw-dev-environments.com/watch',
    );
  });

  test('falls back to localhost off a hosted-env VM', () => {
    expect(watchUrl({})).toBe('http://localhost:1001/watch');
  });
});

describe('coachSummary', () => {
  test('opens with the follow link', () => {
    const lines = coachSummary(input()).split('\n').filter((l) => l.trim() !== '');
    expect(lines.slice(0, 3)).toContain('https://vm1-port-1001.proxy.example.com/watch');
  });

  test('shows the mode, the tab and what is enabled', () => {
    const md = coachSummary(input({ view: { tab: 'evals' } }));
    expect(md).toContain('- Mode: 2 of 6, Tools');
    expect(md).toContain('- Tab: Evals');
    expect(md).toContain('[x] Search the knowledge base');
    expect(md).toContain('[ ] Calculator');
    expect(md).toContain('not editable until Tone of voice mode');
  });

  test('says when the learner page has not reported in', () => {
    expect(coachSummary(input())).toContain("hasn't reported in yet");
  });

  test("lists the block's cases with results, running cases and failures", () => {
    const toolsCases = caseSummaries().filter((c) => c.block === 'tools');
    const [first, second, third] = toolsCases;
    const view: LearnerView = {
      'evals.latest': { [first.id]: result(first.id, true), [second.id]: result(second.id, false) },
      'evals.running': [third.id],
    };
    const md = coachSummary(input({ view }));
    expect(md).toContain(`✓  ${first.name}`);
    expect(md).toContain(`✗  ${second.name}`);
    expect(md).toContain('- The reply must mention "Kipper Lane".');
    expect(md).toContain(`⏳ ${third.name} (running)`);
    expect(md).toContain('Latest results: 1/2 passing');
    expect(md).toContain('a run is in progress, 1 case still to finish');
  });

  test('summarises run history for the block and counts runs elsewhere', () => {
    const run = (block: EvalRun['block']): EvalRun => ({
      id: block,
      startedAt: '2026-07-14T09:05:00.000Z',
      block,
      configSummary: { systemPromptChars: 10, toneBrief: null, ruleCount: 0, skillNames: [], enabledTools: [] },
      results: [],
      totals: { passed: 2, total: 5, usage: USAGE, costUsd: 0.004 },
    });
    const md = coachSummary(input({ runs: [run('investigation'), run('tools')] }));
    expect(md).toContain('#1 at 09:05 UTC: 2/5 passing, partial, 1,200 tokens, $0.0040');
    expect(md).toContain('Runs in other blocks: Investigation (1)');
  });

  test('shows the preset in Investigation mode, with its skill in full', () => {
    const md = coachSummary(input({ mode: 'investigation', config: investigationPreset() }));
    expect(md).toContain('Investigation preset (read-only)');
    expect(md).toContain('#### refund_calculations');
    expect(md).toContain('Orca-tier members never get less than 50% back.');
  });

  test('includes the tail of the chat, with tool calls, and a half-typed message', () => {
    const view: LearnerView = {
      'chat.turns': [
        { role: 'user', text: 'Can I bring my dog?' },
        {
          role: 'agent',
          steps: [
            { kind: 'tool_call', tool: 'search_knowledge_base', input: { query: 'dogs' }, result: '…' },
            { kind: 'text', text: 'Assistance dogs only, I am afraid.' },
          ],
          usage: USAGE,
          running: false,
        },
      ],
      'chat.draft': 'What about cats?',
    };
    const md = coachSummary(input({ view }));
    expect(md).toContain('Customer: Can I bring my dog?');
    expect(md).toContain('→ search_knowledge_base(dogs)');
    expect(md).toContain('Assistance dogs only');
    expect(md).toContain('- Typing a chat message: "What about cats?"');
  });

  test('shows an unsaved skill draft only where skills are editable', () => {
    const view: LearnerView = {
      'skills.editing': 'new',
      'skills.draft': { name: 'dog_policy', description: 'Pets.', body: 'Check the FAQ.' },
    };
    expect(coachSummary(input({ mode: 'skills', view }))).toContain('### Unsaved skill draft (new skill)');
    expect(coachSummary(input({ mode: 'tools', view }))).not.toContain('Unsaved skill draft');
  });

  test('fences text that itself contains backticks', () => {
    const config = { ...baselineConfig(), systemPrompt: 'Use ```code``` blocks.' };
    expect(coachSummary(input({ config }))).toContain('````text\nUse ```code``` blocks.\n````');
  });
});

describe('writeCoachFile', () => {
  test('writes the one file the sync watches, and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coach-'));
    writeCoachFile(dir);
    expect(readdirSync(dir)).toEqual([COACH_FILE]);
    expect(readFileSync(join(dir, COACH_FILE), 'utf-8')).toContain('/watch');
  });
});

describe('view routes', () => {
  afterEach(resetView);

  test('PUT /view stores a known key', async () => {
    const response = await routes.request('/view', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'tab', value: 'evals' }),
    });
    expect(response.status).toBe(200);
    expect(getView().tab).toBe('evals');
  });

  test('PUT /view rejects an unknown key', async () => {
    const response = await routes.request('/view', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'anything', value: 1 }),
    });
    expect(response.status).toBe(400);
  });

  test('GET /view/events opens with a snapshot, then streams each change', async () => {
    setViewKey('tab', 'chat');
    const controller = new AbortController();
    const response = await routes.request('/view/events', { signal: controller.signal });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const readUntil = async (needle: string) => {
      while (!text.includes(needle)) {
        const { value } = await reader.read();
        text += decoder.decode(value);
      }
    };
    await readUntil('event: snapshot');
    await readUntil('\n\n');
    expect(text).toContain('data: {"tab":"chat"}');
    setViewKey('chat.draft', 'Hello');
    await readUntil('event: key');
    await readUntil('"Hello"');
    expect(text).toContain('data: {"key":"chat.draft","value":"Hello"}');
    controller.abort();
    await reader.cancel();
  });
});
