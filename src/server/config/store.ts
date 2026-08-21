import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AgentConfig, EvalRun, Mode, Skill } from '../../shared/types';
import { isMode } from '../../shared/types';
import { isValidToolId } from '../agent/tools';
import { BASE_PERSONA } from '../scenario';

// Learner state lives in plain JSON files under DATA_DIR (a Docker volume in
// the hosted environment, ./data locally). One learner per VM, so no locking.

const DATA_DIR = process.env.DATA_DIR ?? './data';
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const MODE_PATH = join(DATA_DIR, 'mode.json');
const RUNS_PATH = join(DATA_DIR, 'runs.json');

/** The starting point every learner gets once they leave Investigation mode:
 * the minimal persona and nothing else. A blank slate on purpose — the
 * session is them building the agent up, block by block. */
export function baselineConfig(): AgentConfig {
  return {
    systemPrompt: BASE_PERSONA,
    toneBrief: null,
    rules: [],
    skills: [],
    enabledTools: [],
  };
}

/** The agent learners meet in Investigation mode: already set up, working,
 * and read-only. Capable enough to be worth investigating — but not perfect,
 * which the eval exercise on the evals slide depends on. */
export function investigationPreset(): AgentConfig {
  return {
    systemPrompt: [
      BASE_PERSONA,
      'Be friendly, clear, and honest. Answer the question the customer actually asked.',
    ].join('\n'),
    toneBrief: null,
    rules: [
      'Only state policies you have found in the knowledge base.',
      "If you can't find a booking or a policy, say so — never guess or invent details.",
    ],
    skills: [
      {
        name: 'refund_calculations',
        description: 'How to work out the refund for any cancellation or refund question.',
        body: [
          "1. Look up the booking to find the amount paid, the tour date, and the customer's membership tier.",
          '2. Work out how many days of notice the customer is giving, counting from today to the tour date.',
          '3. If the COMPANY cancelled the sailing, the weather policy applies: full refund, or free rebooking plus a 20% voucher.',
          '4. Otherwise use the standard ladder: 14+ days 100%, 7-13 days 75%, 48 hours to 6 days 50%, under 48 hours 0%.',
          '5. Orca-tier members never get less than 50% back.',
          '6. Group bookings (10+ people) use their own schedule - check the group-bookings document.',
          '7. Use the calculator for the arithmetic, and show the customer the calculation, not just the final number.',
        ].join('\n'),
      },
    ],
    enabledTools: ['search_knowledge_base', 'lookup_booking', 'calculator'],
  };
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function sanitiseSkill(skill: unknown): Skill | null {
  if (typeof skill !== 'object' || skill === null) return null;
  const s = skill as Record<string, unknown>;
  if (typeof s.name !== 'string' || s.name.trim() === '') return null;
  return {
    name: s.name.trim(),
    description: typeof s.description === 'string' ? s.description : '',
    body: typeof s.body === 'string' ? s.body : '',
  };
}

/** Accept only well-formed config from the client; drop anything else. */
export function sanitiseConfig(raw: unknown): AgentConfig {
  const base = baselineConfig();
  if (typeof raw !== 'object' || raw === null) return base;
  const input = raw as Record<string, unknown>;
  const systemPrompt =
    typeof input.systemPrompt === 'string' && input.systemPrompt.trim() !== ''
      ? input.systemPrompt
      : base.systemPrompt;
  const toneBrief = typeof input.toneBrief === 'string' && input.toneBrief !== '' ? input.toneBrief : null;
  const rules = Array.isArray(input.rules)
    ? input.rules.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim())
    : base.rules;
  const skills = Array.isArray(input.skills)
    ? input.skills.map(sanitiseSkill).filter((s): s is Skill => s !== null)
    : base.skills;
  const enabledTools = Array.isArray(input.enabledTools)
    ? input.enabledTools.filter((t): t is string => typeof t === 'string' && isValidToolId(t))
    : base.enabledTools;
  return { systemPrompt, toneBrief, rules, skills, enabledTools };
}

export function loadMode(): Mode {
  try {
    const parsed = JSON.parse(readFileSync(MODE_PATH, 'utf-8'));
    return isMode(parsed.mode) ? parsed.mode : 'investigation';
  } catch {
    return 'investigation';
  }
}

export function saveMode(mode: Mode): Mode {
  ensureDataDir();
  writeFileSync(MODE_PATH, JSON.stringify({ mode }, null, 2));
  return mode;
}

/** The learner's own config (what they edit from Tools mode onwards). */
export function loadLearnerConfig(): AgentConfig {
  try {
    return sanitiseConfig(JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')));
  } catch {
    return baselineConfig();
  }
}

/** The config the agent actually runs with: the fixed preset in
 * Investigation mode, the learner's own config everywhere else. */
export function activeConfig(mode: Mode = loadMode()): AgentConfig {
  return mode === 'investigation' ? investigationPreset() : loadLearnerConfig();
}

export function saveConfig(config: AgentConfig): AgentConfig {
  ensureDataDir();
  const clean = sanitiseConfig(config);
  writeFileSync(CONFIG_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

export function resetConfig(): AgentConfig {
  return saveConfig(baselineConfig());
}

export function loadRuns(): EvalRun[] {
  try {
    const runs = JSON.parse(readFileSync(RUNS_PATH, 'utf-8'));
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

export function appendRun(run: EvalRun): void {
  ensureDataDir();
  const runs = loadRuns();
  runs.push(run);
  writeFileSync(RUNS_PATH, JSON.stringify(runs, null, 2));
}

export function clearRuns(): void {
  ensureDataDir();
  writeFileSync(RUNS_PATH, JSON.stringify([]));
}
