import { describe, expect, test } from 'bun:test';
import { buildSystemPrompt } from '../../src/server/agent/systemPrompt';
import { baselineConfig, investigationPreset } from '../../src/server/config/store';

describe('buildSystemPrompt', () => {
  test('baseline is the persona plus the date: no rules or skills sections', () => {
    const prompt = buildSystemPrompt(baselineConfig());
    expect(prompt).toContain('Finn');
    expect(prompt).toContain('Tuesday 14 July 2026');
    expect(prompt).not.toContain('## Rules');
    expect(prompt).not.toContain('## Skills');
  });

  test('the simulated date is appended even when the learner rewrites the prompt', () => {
    const prompt = buildSystemPrompt({
      ...baselineConfig(),
      systemPrompt: 'You are a pirate. Say arr.',
    });
    expect(prompt).toContain('You are a pirate. Say arr.');
    expect(prompt).toContain('Tuesday 14 July 2026');
    // The learner prompt comes first; the date line follows it.
    expect(prompt.indexOf('pirate')).toBeLessThan(prompt.indexOf('Tuesday 14 July 2026'));
  });

  test('rules appear verbatim, one bullet each', () => {
    const prompt = buildSystemPrompt({
      ...baselineConfig(),
      rules: ['Always answer in one paragraph.', 'Never invent policies.'],
    });
    expect(prompt).toContain('- Always answer in one paragraph.');
    expect(prompt).toContain('- Never invent policies.');
  });

  test('skills contribute only name + description, never the body', () => {
    const prompt = buildSystemPrompt({
      ...baselineConfig(),
      skills: [
        {
          name: 'refund_calculations',
          description: 'How to work out refunds correctly.',
          body: 'SECRET-BODY-TEXT step one step two',
        },
      ],
    });
    expect(prompt).toContain('refund_calculations: How to work out refunds correctly.');
    expect(prompt).toContain('load_skill');
    expect(prompt).not.toContain('SECRET-BODY-TEXT');
  });

  test('the investigation preset keeps the skill body out of the prompt too', () => {
    const prompt = buildSystemPrompt(investigationPreset());
    expect(prompt).toContain('refund_calculations');
    expect(prompt).not.toContain('standard ladder: 14+ days');
  });
});
