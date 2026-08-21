import type {
  AgentConfig,
  ChatEvent,
  CostBudgetLevel,
  EvalCaseSummary,
  EvalEvent,
  EvalRun,
  Mode,
  ToneBrief,
  ToolInfo,
} from '../shared/types';

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Server errors carry a useful message in the body where possible.
    const body = await response.json().catch(() => null);
    const message =
      body && typeof body.error === 'string'
        ? body.error
        : `Request failed: ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export interface ConfigResponse {
  mode: Mode;
  config: AgentConfig;
  tools: ToolInfo[];
  toneBriefs: ToneBrief[];
  simulatedDate: string;
}

export function getConfig(): Promise<ConfigResponse> {
  return fetch('/api/config').then((r) => json<ConfigResponse>(r));
}

export function putConfig(config: AgentConfig): Promise<{ config: AgentConfig }> {
  return fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).then((r) => json<{ config: AgentConfig }>(r));
}

export function putMode(mode: Mode): Promise<ConfigResponse> {
  return fetch('/api/mode', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  }).then((r) => json<ConfigResponse>(r));
}

export function resetConfig(): Promise<ConfigResponse> {
  return fetch('/api/config/reset', { method: 'POST' }).then((r) => json<ConfigResponse>(r));
}

export interface CasesResponse {
  cases: EvalCaseSummary[];
  tonePassThreshold: number;
  costBudgetLevels: CostBudgetLevel[];
}

export function getCases(): Promise<CasesResponse> {
  return fetch('/api/evals/cases').then((r) => json<CasesResponse>(r));
}

export function getRuns(): Promise<{ runs: EvalRun[] }> {
  return fetch('/api/evals/runs').then((r) => json<{ runs: EvalRun[] }>(r));
}

export function clearHistory(): Promise<{ ok: boolean }> {
  return fetch('/api/evals/clear-history', { method: 'POST' }).then((r) =>
    json<{ ok: boolean }>(r),
  );
}

/** Read an NDJSON response line by line, calling onEvent per parsed line. */
async function streamNdjson<E>(
  url: string,
  body: unknown,
  onEvent: (event: E) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as E);
      newline = buffer.indexOf('\n');
    }
  }
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export function streamChat(
  message: string,
  history: HistoryTurn[],
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  return streamNdjson('/api/chat', { message, history }, onEvent);
}

export function streamEvals(
  block: Mode,
  caseIds: string[] | undefined,
  onEvent: (event: EvalEvent) => void,
): Promise<void> {
  return streamNdjson('/api/evals/run', { block, caseIds }, onEvent);
}
