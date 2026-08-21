import { Hono } from 'hono';
import { isMode } from '../shared/types';
import { getProvider, type ChatMessage } from './ai';
import { runAgent } from './agent/loop';
import { toolInfos } from './agent/tools';
import {
  activeConfig,
  appendRun,
  clearRuns,
  loadMode,
  loadRuns,
  resetConfig,
  saveConfig,
  saveMode,
} from './config/store';
import { COST_BUDGET_LEVELS, TONE_PASS_THRESHOLD, caseSummaries } from './evals/cases';
import { runEvals } from './evals/runner';
import { ndjson } from './ndjson';
import { SIMULATED_DATE } from './scenario';
import { TONE_BRIEFS } from './scenario/toneBriefs';

const routes = new Hono();

function configResponse() {
  const mode = loadMode();
  return {
    mode,
    config: activeConfig(mode),
    tools: toolInfos(),
    toneBriefs: TONE_BRIEFS,
    simulatedDate: SIMULATED_DATE,
  };
}

routes.get('/config', (c) => c.json(configResponse()));

routes.put('/config', async (c) => {
  if (loadMode() === 'investigation') {
    return c.json({ error: 'The Investigation agent is fixed — switch mode to start building your own.' }, 403);
  }
  const body = await c.req.json();
  return c.json({ config: saveConfig(body) });
});

routes.post('/config/reset', (c) => {
  resetConfig();
  return c.json(configResponse());
});

routes.put('/mode', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!isMode(body.mode)) {
    return c.json({ error: `Unknown mode: ${String(body.mode)}` }, 400);
  }
  saveMode(body.mode);
  return c.json(configResponse());
});

routes.get('/evals/cases', (c) =>
  c.json({
    cases: caseSummaries(),
    tonePassThreshold: TONE_PASS_THRESHOLD,
    costBudgetLevels: COST_BUDGET_LEVELS,
  }),
);

routes.get('/evals/runs', (c) => c.json({ runs: loadRuns() }));

routes.post('/evals/clear-history', (c) => {
  clearRuns();
  return c.json({ ok: true });
});

interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

routes.post('/chat', async (c) => {
  const body = await c.req.json();
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return c.json({ error: 'message is required' }, 400);

  // The client sends prior turns as plain text. Tool calls from earlier turns
  // are not replayed — each turn's tool work stays inside that turn, which
  // keeps context (and cost) from snowballing across a long conversation.
  const history: HistoryTurn[] = Array.isArray(body.history)
    ? body.history.filter(
        (t: HistoryTurn) =>
          (t?.role === 'user' || t?.role === 'assistant') && typeof t?.text === 'string',
      )
    : [];
  const messages: ChatMessage[] = [
    ...history.map((t) => ({
      role: t.role,
      content: [{ type: 'text' as const, text: t.text }],
    })),
    { role: 'user' as const, content: [{ type: 'text' as const, text: message }] },
  ];

  const config = activeConfig();
  return ndjson(async (write) => {
    await runAgent({ provider: getProvider(), config, messages, onEvent: write });
  });
});

routes.post('/evals/run', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const block = isMode(body.block) ? body.block : loadMode();
  const caseIds = Array.isArray(body.caseIds)
    ? body.caseIds.filter((id: unknown): id is string => typeof id === 'string')
    : undefined;
  const config = activeConfig();
  return ndjson(async (write) => {
    const run = await runEvals({ provider: getProvider(), config, block, caseIds, onEvent: write });
    appendRun(run);
  });
});

export default routes;
