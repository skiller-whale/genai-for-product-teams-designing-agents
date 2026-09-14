import { expect, test, type Page } from '@playwright/test';

// E2E tests mock every /api route: no LLM, no server state. They exercise the
// learner-visible flows — switching mode, editing config, chatting, running
// and rerunning evals.

const TOOLS = [
  { id: 'search_knowledge_base', name: 'Search the knowledge base', description: 'Searches policies.' },
  { id: 'calculator', name: 'Calculator', description: 'Does exact arithmetic.' },
  { id: 'load_skill', name: 'Load a skill', description: 'Built-in.', alwaysOn: true },
];

const TONE_BRIEFS = [
  { id: 'concierge', name: 'The Concierge', brief: 'Formal and precise.', difficulty: 'easier' },
  { id: 'deckhand', name: 'The Deckhand', brief: 'Bright, chatty and quick.', difficulty: 'harder' },
];

const PRESET_CONFIG = {
  systemPrompt: 'You are Finn. Be friendly.\nOnly state policies you have found in the knowledge base.',
  toneBrief: null,
  rules: [],
  skills: [{ name: 'refund_calculations', description: 'Refund sums.', body: 'Use the ladder.' }],
  enabledTools: ['search_knowledge_base', 'calculator'],
};

const BLANK_CONFIG = {
  systemPrompt: 'You are Finn.',
  toneBrief: null,
  rules: [],
  skills: [],
  enabledTools: [],
};

const CASES = {
  cases: [
    {
      id: 'inv-tour-facts',
      name: 'Tour length and price',
      block: 'investigation',
      input: 'How long is the tour?',
      checks: ['The reply must mention "6 hour".'],
    },
    {
      id: 'inv-web-trap',
      name: 'The archived refund policy trap',
      block: 'investigation',
      input: 'Full refund, right?',
      checks: ['The reply must mention "50%".'],
    },
    {
      id: 'tools-parking',
      name: 'Practical detail buried in the FAQ',
      block: 'tools',
      input: 'Where do I park?',
      checks: ['The reply must mention "Kipper Lane".'],
    },
  ],
  tonePassThreshold: 70,
  costBudgetLevels: [
    { name: 'Budget', usd: 0.25 },
    { name: 'Lean', usd: 0.15 },
    { name: 'Frugal', usd: 0.1 },
  ],
};

const CASE_RESULT_PASS = {
  caseId: 'inv-tour-facts',
  name: 'Tour length and price',
  passed: true,
  failures: [],
  answer: 'Six hours, £120.',
  transcript: [{ kind: 'text', text: 'Six hours, £120.' }],
  usage: { inputTokens: 500, outputTokens: 40 },
};

const CASE_RESULT_FAIL = {
  caseId: 'inv-web-trap',
  name: 'The archived refund policy trap',
  passed: false,
  failures: ['The answer never mentions "50%" or "£60".'],
  answer: 'Yes, full refund confirmed!',
  transcript: [{ kind: 'text', text: 'Yes, full refund confirmed!' }],
  usage: { inputTokens: 700, outputTokens: 60 },
};

const RUN = {
  id: 'run-1',
  startedAt: '2026-07-14T10:00:00.000Z',
  block: 'investigation',
  configSummary: {
    systemPromptChars: 26,
    toneBrief: null,
    ruleCount: 1,
    skillNames: ['refund_calculations'],
    enabledTools: ['search_knowledge_base', 'calculator'],
  },
  results: [CASE_RESULT_PASS, CASE_RESULT_FAIL],
  totals: {
    passed: 1,
    total: 2,
    usage: { inputTokens: 1200, outputTokens: 100 },
    costUsd: 0.0051,
  },
};

function ndjson(events: unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function configResponse(mode: string) {
  return {
    mode,
    config: mode === 'investigation' ? PRESET_CONFIG : BLANK_CONFIG,
    tools: TOOLS,
    toneBriefs: TONE_BRIEFS,
    simulatedDate: 'Tuesday 14 July 2026',
  };
}

async function mockApi(page: Page) {
  let mode = 'investigation';
  await page.route('**/api/config', (route) => {
    if (route.request().method() === 'PUT') {
      if (mode === 'investigation') {
        return route.fulfill({ status: 403, json: { error: 'The Investigation agent is fixed.' } });
      }
      return route.fulfill({ json: { config: route.request().postDataJSON() } });
    }
    return route.fulfill({ json: configResponse(mode) });
  });
  await page.route('**/api/mode', (route) => {
    mode = route.request().postDataJSON().mode;
    return route.fulfill({ json: configResponse(mode) });
  });
  await page.route('**/api/config/reset', (route) => route.fulfill({ json: configResponse(mode) }));
  await page.route('**/api/evals/cases', (route) => route.fulfill({ json: CASES }));
  await page.route('**/api/evals/runs', (route) => route.fulfill({ json: { runs: [] } }));
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: ndjson([
        { type: 'tool_call', tool: 'search_knowledge_base', input: { query: 'orca odyssey' } },
        { type: 'tool_result', tool: 'search_knowledge_base', result: '[document: tours]…' },
        { type: 'usage', usage: { inputTokens: 400, outputTokens: 30 } },
        { type: 'assistant_text', text: 'The Full-Day Orca Odyssey lasts 6 hours and costs £120.' },
        { type: 'usage', usage: { inputTokens: 500, outputTokens: 50 } },
        {
          type: 'done',
          finalText: 'The Full-Day Orca Odyssey lasts 6 hours and costs £120.',
          usage: { inputTokens: 900, outputTokens: 80 },
          llmCalls: 2,
        },
      ]),
    }),
  );
  await page.route('**/api/evals/run', (route) => {
    const body = route.request().postDataJSON();
    const results =
      Array.isArray(body.caseIds) && body.caseIds.length > 0
        ? [CASE_RESULT_PASS, CASE_RESULT_FAIL].filter((r) => body.caseIds.includes(r.caseId))
        : [CASE_RESULT_PASS, CASE_RESULT_FAIL];
    return route.fulfill({
      contentType: 'application/x-ndjson',
      body: ndjson([
        { type: 'run_started', runId: 'run-1', cases: CASES.cases },
        ...results.map((result) => ({ type: 'case_result', result })),
        { type: 'run_complete', run: { ...RUN, results } },
      ]),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
});

test('investigation mode shows the preset agent read-only', async ({ page }) => {
  await expect(page.getByTestId('mode-slider')).toBeVisible();
  await expect(page.getByTestId('design-readonly-note')).toBeVisible();
  await expect(page.locator('.sim-date')).toContainText('Tuesday 14 July 2026');

  // The preset is on display — prompt (rules folded in), skill, tools — but not editable.
  await expect(page.getByTestId('system-prompt-panel')).toContainText('You are Finn. Be friendly.');
  await expect(page.getByTestId('system-prompt-panel')).toContainText('Only state policies');
  await expect(page.getByTestId('rules-panel')).toHaveCount(0);
  await expect(page.getByTestId('skills-panel')).toContainText('refund_calculations');
  await expect(page.getByTestId('tools-panel')).toContainText('Calculator');
  await expect(page.getByRole('button', { name: 'Reset my agent' })).toHaveCount(0);
});

test('tools mode unlocks only the tools section', async ({ page }) => {
  await page.getByRole('button', { name: /Tools/ }).click();

  await expect(page.getByTestId('tools-panel')).toBeVisible();
  await expect(page.getByTestId('tools-panel').getByRole('checkbox').first()).toBeEnabled();
  await expect(page.getByTestId('system-prompt-panel')).toHaveCount(0);
  await expect(page.getByTestId('skills-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset my agent' })).toBeVisible();
});

test('prompt mode adds the system prompt editor and tone picker', async ({ page }) => {
  await page.getByRole('button', { name: /System prompt/ }).click();

  await expect(page.getByLabel('System prompt')).toBeVisible();
  await expect(page.getByTestId('tone-picker')).toContainText('The Deckhand');
  await expect(page.getByTestId('tools-panel')).toBeVisible();

  // Picking a tone brief saves the config.
  const put = page.waitForRequest(
    (request) => request.url().includes('/api/config') && request.method() === 'PUT',
  );
  await page.getByText('The Deckhand').click();
  const request = await put;
  expect(request.postDataJSON().toneBrief).toBe('deckhand');
});

test('rules mode edits the same system prompt as prompt mode, with no separate rules panel', async ({ page }) => {
  await page.getByRole('button', { name: /Rules/ }).click();

  await expect(page.getByLabel('System prompt')).toBeVisible();
  await expect(page.getByTestId('tools-panel')).toBeVisible();
  await expect(page.getByTestId('rules-panel')).toHaveCount(0);

  const put = page.waitForRequest(
    (request) => request.url().includes('/api/config') && request.method() === 'PUT',
  );
  await page.getByLabel('System prompt').fill('You are Finn. Never invent policies.');
  const request = await put;
  expect(request.postDataJSON().systemPrompt).toBe('You are Finn. Never invent policies.');
});

test('chatting shows the tool step and the answer, and keeps the input focused', async ({ page }) => {
  const input = page.getByPlaceholder('Write a customer message…');
  await input.fill('How long is the Orca Odyssey?');
  await input.press('Enter');

  await expect(page.getByText('search_knowledge_base')).toBeVisible();
  await expect(page.getByText(/lasts 6 hours and costs £120/)).toBeVisible();
  await expect(page.getByText(/980 tokens/)).toBeVisible();

  // The box is still focused, so a follow-up is just typing.
  await expect(input).toBeFocused();

  // Esc clears the conversation.
  await input.press('Escape');
  await expect(page.getByText(/lasts 6 hours and costs £120/)).toHaveCount(0);
});

test('running a block fills the case list and the history table', async ({ page }) => {
  await page.getByRole('button', { name: /Evals/ }).click();

  // The cases and their checks are readable before anything runs.
  await expect(page.getByText('Tour length and price')).toBeVisible();
  await page.getByRole('button', { name: /Tour length and price/ }).click();
  await expect(page.getByText('The reply must mention "6 hour".')).toBeVisible();

  await page.getByRole('button', { name: /Run this block/ }).click();

  await expect(page.getByTestId('evals-summary')).toContainText('1/2 passing');
  await expect(page.getByText('Run history')).toBeVisible();
  await expect(page.getByRole('cell', { name: '1/2' })).toBeVisible();

  // Drill into the failing case.
  await page
    .locator('.case-card', { hasText: 'The archived refund policy trap' })
    .getByRole('button', { name: 'Details' })
    .click();
  const detail = page.locator('.case-detail');
  await expect(detail.getByText('never mentions "50%"')).toBeVisible();
  await expect(detail.getByText('Yes, full refund confirmed!')).toBeVisible();
});

test('a single case can be rerun on its own', async ({ page }) => {
  await page.getByRole('button', { name: /Evals/ }).click();

  const runRequest = page.waitForRequest(
    (request) => request.url().includes('/api/evals/run') && request.method() === 'POST',
  );
  await page
    .locator('.case-card', { hasText: 'Tour length and price' })
    .getByRole('button', { name: /Run$/ })
    .click();
  const request = await runRequest;
  expect(request.postDataJSON().caseIds).toEqual(['inv-tour-facts']);

  // Only the rerun case gains a result.
  await expect(
    page.locator('.case-card', { hasText: 'Tour length and price' }).locator('.case-status'),
  ).toHaveText('✓');
});

test('the evals pane follows the mode', async ({ page }) => {
  await page.getByRole('button', { name: /Tools/ }).click();
  await page.getByRole('button', { name: /Evals/ }).click();

  await expect(page.getByText('Practical detail buried in the FAQ')).toBeVisible();
  await expect(page.getByText('Tour length and price')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Run this block \(1\)/ })).toBeVisible();
});
