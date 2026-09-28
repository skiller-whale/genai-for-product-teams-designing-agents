import { existsSync, mkdirSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { toolInfos } from '../agent/tools';
import { activeConfig, loadMode, loadRuns } from '../config/store';
import { COST_BUDGET_LEVELS, TONE_PASS_THRESHOLD, caseSummaries } from '../evals/cases';
import { SIMULATED_DATE } from '../scenario';
import { TONE_BRIEFS } from '../scenario/toneBriefs';
import { coachSummary } from './summary';
import { getView } from './view';

// Writes the coach sync file. In the hosted environment COACH_SYNC_DIR is a
// volume shared with the learnersync container, which watches only this one
// file and posts each new version to Train, where it appears in the coach's
// "Recently edited files". Unset (local development), nothing is written.

export const COACH_FILE = 'AGENT-WORKBENCH.md';

/** Learners change things many times a second while typing; the coach needs
 * a snapshot every few seconds, not one per keystroke. */
const WRITE_DELAY_MS = 3000;

/** The follow-mode link a coach can open from outside the VM. The hosted
 * environment's port proxy serves exposed port N of the VM whose editor is
 * at <id>.<domain> at <id>-port-N.<domain>. */
export function watchUrl(env: Record<string, string | undefined> = process.env): string {
  const port = env.WORKBENCH_PUBLIC_PORT || '1001';
  const host = env.SW_HOSTNAME;
  if (!host || !host.includes('.')) return `http://localhost:${port}/watch`;
  const [id, ...domain] = host.split('.');
  return `https://${id}-port-${port}.${domain.join('.')}/watch`;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastWritten: string | undefined;

/** Write the file a few seconds from now, folding in any further changes. */
export function scheduleCoachFile(): void {
  if (!process.env.COACH_SYNC_DIR || timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    writeCoachFile();
  }, WRITE_DELAY_MS);
}

export function writeCoachFile(dir: string | undefined = process.env.COACH_SYNC_DIR): void {
  if (!dir) return;
  try {
    const mode = loadMode();
    const contents = coachSummary({
      watchUrl: watchUrl(),
      now: new Date(),
      mode,
      config: activeConfig(mode),
      runs: loadRuns(),
      view: getView(),
      tools: toolInfos(),
      cases: caseSummaries(),
      toneBriefs: TONE_BRIEFS,
      simulatedDate: SIMULATED_DATE,
      tonePassThreshold: TONE_PASS_THRESHOLD,
      costBudgetLevels: COST_BUDGET_LEVELS,
    });
    // Skip a write when only the timestamp would change, so the coach's
    // file list isn't bumped by nothing.
    const withoutTime = contents.replace(/updated \d\d:\d\d:\d\d UTC/, '');
    if (withoutTime === lastWritten) return;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Write then rename, so the sync never reads a half-written file. The
    // temporary name has no .md extension, so the sync ignores it.
    const tmp = join(dir, `.${COACH_FILE}.tmp`);
    writeFileSync(tmp, contents);
    renameSync(tmp, join(dir, COACH_FILE));
    lastWritten = withoutTime;
  } catch (err) {
    console.error('Could not write the coach sync file:', err);
  }
}
