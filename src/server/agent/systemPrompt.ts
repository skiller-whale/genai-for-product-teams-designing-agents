import type { AgentConfig } from '../../shared/types';
import { DATE_LINE } from '../scenario';

/** Assemble the agent's system prompt: the learner's own prompt first, then
 * the fixed simulated-date line (never editable — refund arithmetic and the
 * evals hang off it), then rules and the skill index. Rules ride along on
 * every single request; skills contribute only their name + description until
 * loaded. That difference is the token-cost story the session teaches, so
 * keep it honest. */
export function buildSystemPrompt(config: AgentConfig): string {
  const sections: string[] = [config.systemPrompt.trim(), DATE_LINE];

  if (config.rules.length > 0) {
    sections.push(
      ['## Rules', 'Follow these rules in every reply:', ...config.rules.map((r) => `- ${r}`)].join('\n'),
    );
  }

  if (config.skills.length > 0) {
    sections.push(
      [
        '## Skills',
        'You have the following skills — named procedures with detailed instructions.',
        'Before handling a request that a skill covers, load that skill with the load_skill tool and follow its instructions.',
        ...config.skills.map((s) => `- ${s.name}: ${s.description}`),
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}
