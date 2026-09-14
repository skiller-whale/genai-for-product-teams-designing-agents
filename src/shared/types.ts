// Types shared between the server and the client.

/** The session's modes, in teaching order. Learners move through them with the
 * mode slider; each mode unlocks more of the design pane and brings its own
 * block of eval cases. */
export type Mode = 'investigation' | 'tools' | 'prompt' | 'rules' | 'skills' | 'cost';

/** The learner-editable areas of the agent's design. */
export type ConfigArea = 'tools' | 'systemPrompt' | 'rules' | 'skills';

export interface ModeInfo {
  id: Mode;
  label: string;
  /** Which areas the learner can edit in this mode. Cumulative: each mode
   * keeps everything the previous ones unlocked. Investigation unlocks
   * nothing — the agent there is a fixed preset, shown read-only. */
  editable: ConfigArea[];
}

export const MODES: ModeInfo[] = [
  { id: 'investigation', label: 'Investigation', editable: [] },
  { id: 'tools', label: 'Tools', editable: ['tools'] },
  { id: 'prompt', label: 'System prompt', editable: ['tools', 'systemPrompt'] },
  { id: 'rules', label: 'Rules', editable: ['tools', 'systemPrompt'] },
  { id: 'skills', label: 'Skills', editable: ['tools', 'systemPrompt', 'skills'] },
  { id: 'cost', label: 'Cost', editable: ['tools', 'systemPrompt', 'skills'] },
];

export function modeInfo(mode: Mode): ModeInfo {
  return MODES.find((m) => m.id === mode) ?? MODES[0];
}

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && MODES.some((m) => m.id === value);
}

/** A tone of voice the learner can pick in the System Prompt exercise. The
 * judge scores replies against the chosen brief as a percentage. */
export interface ToneBrief {
  id: string;
  name: string;
  /** The learner-facing brief: what the voice should sound like. */
  brief: string;
  /** Relative difficulty, shown to the learner so the choice is informed. */
  difficulty: 'easier' | 'harder';
}

/** A learner-authored skill: a named, plain-English procedure the agent can
 * load on demand. Only the name + description live in the system prompt; the
 * body is fetched by the agent with the built-in load_skill tool. */
export interface Skill {
  name: string;
  description: string;
  body: string;
}

/** The learner-editable agent configuration. */
export interface AgentConfig {
  /** The agent's standing orders, read before every message. The server
   * always appends the fixed simulated-date line — that part is not
   * editable, because the evals depend on it. */
  systemPrompt: string;
  /** Which tone brief the judge scores the prompt block against. */
  toneBrief: string | null;
  /** No longer editable — rules are taught as standing instructions written
   * into `systemPrompt` itself. Kept only so an old stored config.json with a
   * `rules` array doesn't crash on load; always empty in practice, and
   * `buildSystemPrompt` is a no-op for an empty list. */
  rules: string[];
  skills: Skill[];
  /** Ids of the tools the agent is allowed to use (load_skill is always on). */
  enabledTools: string[];
}

/** Learner-facing description of a tool (the implementation lives server-side). */
export interface ToolInfo {
  id: string;
  name: string;
  description: string;
  /** Built-in tools (load_skill) cannot be toggled off. */
  alwaysOn?: boolean;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** One visible step in an agent run, as shown in the chat transcript. */
export type TranscriptStep =
  | { kind: 'text'; text: string }
  | {
      kind: 'tool_call';
      tool: string;
      input: Record<string, unknown>;
      result: string;
      isError?: boolean;
    };

/** Keepalive emitted on every NDJSON stream so idle timeouts (Bun's, or any
 * proxy's) never cut a connection that is quietly waiting on the LLM.
 * Clients ignore it. */
export interface HeartbeatEvent {
  type: 'heartbeat';
}

/** NDJSON events streamed from POST /api/chat. */
export type ChatEvent =
  | { type: 'assistant_text'; text: string }
  | { type: 'tool_call'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result: string; isError?: boolean }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done'; finalText: string; usage: TokenUsage; llmCalls: number }
  | { type: 'error'; message: string }
  | HeartbeatEvent;

// ---- Evals ----

/** What the client needs to know about an eval case. The checks are
 * plain-English summaries of the assertions and rubric — learners are meant
 * to read them before running anything. */
export interface EvalCaseSummary {
  id: string;
  name: string;
  block: Mode;
  input: string;
  checks: string[];
}

/** One rung of the cost block's budget ladder. */
export interface CostBudgetLevel {
  name: string;
  usd: number;
}

export interface JudgeVerdict {
  verdict: 'PASS' | 'FAIL';
  reason: string;
}

export interface CaseResult {
  caseId: string;
  name: string;
  passed: boolean;
  /** Human-readable reasons this case failed (empty when passed). */
  failures: string[];
  judge?: JudgeVerdict;
  /** Tone score, 0–100, for scored cases (the prompt block). */
  score?: number;
  answer: string;
  transcript: TranscriptStep[];
  usage: TokenUsage;
}

/** Snapshot of the config an eval run was made with, for run comparison. */
export interface ConfigSummary {
  systemPromptChars: number;
  toneBrief: string | null;
  ruleCount: number;
  skillNames: string[];
  enabledTools: string[];
}

export interface EvalRun {
  id: string;
  startedAt: string;
  block: Mode;
  configSummary: ConfigSummary;
  results: CaseResult[];
  totals: {
    passed: number;
    total: number;
    usage: TokenUsage;
    costUsd: number;
  };
}

/** NDJSON events streamed from POST /api/evals/run. */
export type EvalEvent =
  | { type: 'run_started'; runId: string; cases: EvalCaseSummary[] }
  | { type: 'case_result'; result: CaseResult }
  | { type: 'run_complete'; run: EvalRun }
  | { type: 'error'; message: string }
  | HeartbeatEvent;
