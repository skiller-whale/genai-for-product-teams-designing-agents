import type {
  AgentConfig,
  CaseResult,
  ChatTurn,
  CostBudgetLevel,
  EvalCaseSummary,
  EvalRun,
  LearnerView,
  Mode,
  ToneBrief,
  ToolInfo,
  TranscriptStep,
} from '../../shared/types';
import { MODES, modeInfo } from '../../shared/types';
import { costUsd, formatCost, formatTokens } from '../../shared/pricing';

// The coach sync file: a link to the learner's Workbench in follow mode, then
// a plain-text picture of what that link shows, so a coach can see where the
// learner has got to at a glance without opening it.

export interface SummaryInput {
  watchUrl: string;
  now: Date;
  mode: Mode;
  /** The config the agent runs with in this mode (the preset in Investigation). */
  config: AgentConfig;
  runs: EvalRun[];
  view: LearnerView;
  tools: ToolInfo[];
  cases: EvalCaseSummary[];
  toneBriefs: ToneBrief[];
  simulatedDate: string;
  tonePassThreshold: number;
  costBudgetLevels: CostBudgetLevel[];
}

/** How many chat turns (customer message + Finn's reply = 2) to include. */
const CHAT_TURNS_SHOWN = 6;

export function coachSummary(input: SummaryInput): string {
  const sections = [
    header(input),
    onScreen(input),
    evals(input),
    design(input),
    chat(input),
  ];
  return `${sections.filter((s) => s !== '').join('\n\n')}\n`;
}

function header({ watchUrl, now }: SummaryInput): string {
  return [
    '# Agent Workbench (coach view)',
    "Follow the learner's Workbench live. The page shows exactly what they see, and is read-only:",
    watchUrl,
    `The summary below is a snapshot, updated ${now.toISOString().slice(11, 19)} UTC as the learner works.`,
  ].join('\n\n');
}

function onScreen({ mode, view, cases, config }: SummaryInput): string {
  const index = MODES.findIndex((m) => m.id === mode);
  const lines = [`- Mode: ${index + 1} of ${MODES.length}, ${modeInfo(mode).label}`];
  const tab = view.tab ?? 'chat';
  lines.push(`- Tab: ${tab === 'chat' ? 'Chat with Finn' : 'Evals'}`);

  const running = view['evals.running'];
  if (running && running.length > 0) {
    lines.push(`- Evals: a run is in progress, ${running.length} case${running.length === 1 ? '' : 's'} still to finish`);
  }
  const selected = view['evals.selected'];
  if (tab === 'evals' && selected) {
    const name = cases.find((c) => c.id === selected)?.name ?? selected;
    lines.push(`- Reading the details of eval case "${name}"`);
  }
  if (view['chat.busy']) lines.push('- Chat: waiting for Finn to reply');
  const draft = view['chat.draft']?.trim();
  if (draft) lines.push(`- Typing a chat message: "${draft}"`);

  const editing = view['skills.editing'];
  if (editing !== undefined && editing !== null && modeInfo(mode).editable.includes('skills')) {
    const name = editing === 'new' ? 'a new skill' : `the skill "${config.skills[editing]?.name ?? '?'}"`;
    lines.push(`- Editing ${name} (unsaved draft under Agent design)`);
  }
  if (view.error) lines.push(`- Error shown: ${view.error}`);
  if (view['evals.error']) lines.push(`- Evals error shown: ${view['evals.error']}`);
  if (Object.keys(view).length === 0) {
    lines.push("- (The learner's browser hasn't reported in yet: the tab and chat are unknown.)");
  }
  return ['## On screen', lines.join('\n')].join('\n\n');
}

function evals({
  mode,
  runs,
  view,
  cases,
  tonePassThreshold,
  costBudgetLevels,
}: SummaryInput): string {
  const blockCases = cases.filter((c) => c.block === mode);
  const latest = view['evals.latest'] ?? latestResults(runs);
  const running = new Set(view['evals.running'] ?? []);
  const graded = blockCases.map((c) => latest[c.id]).filter((r): r is CaseResult => r !== undefined);

  const lines: string[] = [`## Evals: ${modeInfo(mode).label} block (${blockCases.length} cases)`];

  if (graded.length > 0) {
    const passed = graded.filter((r) => r.passed).length;
    const scores = graded.map((r) => r.score).filter((s): s is number => s !== undefined);
    const cost = graded.reduce((total, r) => total + costUsd(r.usage), 0);
    const parts = [`${passed}/${graded.length} passing`];
    if (scores.length > 0) {
      const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      parts.push(`average tone score ${average}% (pass at ${tonePassThreshold}%)`);
    }
    parts.push(`${formatCost(cost)} for these results`);
    if (mode === 'cost' && costBudgetLevels.length > 0) {
      const top = costBudgetLevels[0];
      parts.push(cost <= top.usd ? `under the ${formatCost(top.usd)} budget` : `over the ${formatCost(top.usd)} budget`);
    }
    lines.push(`Latest results: ${parts.join(' · ')}`);
  } else {
    lines.push('No results in this block yet.');
  }

  const caseLines = blockCases.map((c) => {
    if (running.has(c.id)) return `⏳ ${c.name} (running)`;
    const result = latest[c.id];
    if (!result) return `·  ${c.name} (not run)`;
    const score = result.score !== undefined ? ` (${result.score}%)` : '';
    // The judge's reason is already among the failures.
    const detail = result.passed ? [] : result.failures.map((f) => `     - ${f}`);
    return [`${result.passed ? '✓' : '✗'}  ${c.name}${score}`, ...detail].join('\n');
  });
  if (caseLines.length > 0) lines.push(caseLines.join('\n'));

  const blockRuns = runs.filter((r) => r.block === mode);
  if (blockRuns.length > 0) {
    const history = blockRuns.map((run, index) => {
      const tokens = run.totals.usage.inputTokens + run.totals.usage.outputTokens;
      const partial = run.results.length < blockCases.length ? ', partial' : '';
      return `#${index + 1} at ${run.startedAt.slice(11, 16)} UTC: ${run.totals.passed}/${run.totals.total} passing${partial}, ${formatTokens(tokens)} tokens, ${formatCost(run.totals.costUsd)}`;
    });
    lines.push(`Run history in this block:\n${history.join('\n')}`);
  }

  const elsewhere = MODES.filter((m) => m.id !== mode)
    .map((m) => ({ label: m.label, count: runs.filter((r) => r.block === m.id).length }))
    .filter((m) => m.count > 0)
    .map((m) => `${m.label} (${m.count})`);
  if (elsewhere.length > 0) lines.push(`Runs in other blocks: ${elsewhere.join(', ')}`);

  return lines.join('\n\n');
}

function design({ mode, config, view, tools, toneBriefs, simulatedDate }: SummaryInput): string {
  const investigation = mode === 'investigation';
  const editable = modeInfo(mode).editable;
  const lines: string[] = [
    '## Agent design',
    investigation
      ? "The agent is the pre-built Investigation preset (read-only). The learner's own agent starts from the next mode."
      : "The learner's own agent.",
  ];

  const promptNote = investigation || editable.includes('systemPrompt') ? '' : ', not editable until Tone of voice mode';
  lines.push(
    `### System prompt (${config.systemPrompt.length} characters${promptNote})`,
    fence(config.systemPrompt),
    `Always added by the Workbench: "Today's date is ${simulatedDate}."`,
  );
  if (!investigation) {
    const brief = toneBriefs.find((b) => b.id === config.toneBrief);
    lines.push(`Tone brief: ${brief ? `${brief.name} (${brief.difficulty})` : 'none chosen'}`);
  }

  const enabled = (tool: ToolInfo) => tool.alwaysOn || config.enabledTools.includes(tool.id);
  lines.push(
    `### Tools (${tools.filter(enabled).length} of ${tools.length} on)`,
    tools
      .map((tool) => `[${enabled(tool) ? 'x' : ' '}] ${tool.name}${tool.alwaysOn ? ' (built-in, always on)' : ''}`)
      .join('\n'),
  );

  const skillsNote = investigation || editable.includes('skills') ? '' : ', not editable until Skills mode';
  lines.push(`### Skills (${config.skills.length}${skillsNote})`);
  if (config.skills.length === 0) lines.push('None.');
  for (const skill of config.skills) {
    lines.push(
      `#### ${skill.name}`,
      `Description: ${skill.description || '(none, so the agent may never load it)'}`,
      fence(skill.body || '(no instructions)'),
    );
  }

  const editing = view['skills.editing'];
  const draft = view['skills.draft'];
  if (editing !== undefined && editing !== null && draft && editable.includes('skills')) {
    lines.push(
      `### Unsaved skill draft (${editing === 'new' ? 'new skill' : `editing ${config.skills[editing]?.name ?? '?'}`})`,
      `Name: ${draft.name || '(blank)'}`,
      `Description: ${draft.description || '(blank)'}`,
      fence(draft.body || '(no instructions yet)'),
    );
  }

  return lines.join('\n\n');
}

function chat({ view }: SummaryInput): string {
  const turns = view['chat.turns'];
  if (!turns) return '';
  if (turns.length === 0) return '## Chat\n\nThe chat is empty.';
  const shown = turns.slice(-CHAT_TURNS_SHOWN);
  const lines = [
    '## Chat',
    turns.length > shown.length
      ? `The last ${shown.length} of ${turns.length} messages in the current conversation:`
      : 'The current conversation:',
    ...shown.map(chatTurn),
  ];
  return lines.join('\n\n');
}

function chatTurn(turn: ChatTurn): string {
  if (turn.role === 'user') return `Customer: ${turn.text}`;
  const steps = turn.steps.map(step);
  if (turn.running) steps.push('(still working…)');
  if (turn.error) steps.push(`(error: ${turn.error})`);
  const tokens = turn.usage.inputTokens + turn.usage.outputTokens;
  const cost = !turn.running && tokens > 0 ? ` [${formatTokens(tokens)} tokens · ~${formatCost(costUsd(turn.usage))}]` : '';
  return `Finn:${cost}\n${steps.map((s) => `  ${s.replaceAll('\n', '\n  ')}`).join('\n')}`;
}

function step(s: TranscriptStep): string {
  if (s.kind === 'text') return s.text;
  const input = Object.values(s.input)
    .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join(', ');
  return `→ ${s.tool}(${input})${s.isError ? ' (error)' : ''}`;
}

/** A fenced block that survives backticks inside the text. */
function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const marks = '`'.repeat(longest + 1);
  return `${marks}text\n${text}\n${marks}`;
}

/** The newest result for every case across the whole history. */
function latestResults(runs: EvalRun[]): Record<string, CaseResult> {
  const latest: Record<string, CaseResult> = {};
  for (const run of runs) {
    for (const result of run.results) latest[result.caseId] = result;
  }
  return latest;
}
