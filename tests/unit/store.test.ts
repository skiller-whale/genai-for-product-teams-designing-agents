import { describe, expect, test } from 'bun:test';
import {
  baselineConfig,
  investigationPreset,
  sanitiseConfig,
} from '../../src/server/config/store';

describe('baselineConfig', () => {
  test('is a blank slate: the minimal persona and nothing else', () => {
    const config = baselineConfig();
    expect(config.systemPrompt).toContain('Finn');
    expect(config.systemPrompt).not.toContain('14 July'); // the date is appended by the server, not stored
    expect(config.toneBrief).toBeNull();
    expect(config.rules).toEqual([]);
    expect(config.skills).toEqual([]);
    expect(config.enabledTools).toEqual([]);
  });
});

describe('investigationPreset', () => {
  test('is a working agent: prompt, rules, a refund skill, grounded tools', () => {
    const preset = investigationPreset();
    expect(preset.systemPrompt).toContain('Finn');
    expect(preset.rules.length).toBeGreaterThan(0);
    expect(preset.skills.map((s) => s.name)).toEqual(['refund_calculations']);
    expect(preset.enabledTools).toEqual(['search_knowledge_base', 'lookup_booking', 'calculator']);
  });

  test('never enables the web-search trap', () => {
    expect(investigationPreset().enabledTools).not.toContain('search_the_web');
  });
});

describe('sanitiseConfig', () => {
  test('passes a well-formed config through', () => {
    const config = {
      systemPrompt: 'You are Finn.',
      toneBrief: 'old-salt',
      rules: ['Be nice.'],
      skills: [{ name: 'refunds', description: 'd', body: 'b' }],
      enabledTools: ['search_knowledge_base', 'calculator'],
    };
    expect(sanitiseConfig(config)).toEqual(config);
  });

  test('drops unknown tool ids and load_skill (which is not toggleable)', () => {
    const config = sanitiseConfig({
      rules: [],
      skills: [],
      enabledTools: ['calculator', 'rm_rf', 'load_skill'],
    });
    expect(config.enabledTools).toEqual(['calculator']);
  });

  test('drops malformed rules and skills', () => {
    const config = sanitiseConfig({
      rules: ['ok', '', 42, null],
      skills: [{ name: '', description: 'd', body: 'b' }, { name: 'good' }, 'nonsense'],
      enabledTools: [],
    });
    expect(config.rules).toEqual(['ok']);
    expect(config.skills).toEqual([{ name: 'good', description: '', body: '' }]);
  });

  test('an empty system prompt falls back to the baseline persona', () => {
    const config = sanitiseConfig({ systemPrompt: '   ', rules: [], skills: [], enabledTools: [] });
    expect(config.systemPrompt).toBe(baselineConfig().systemPrompt);
  });

  test('a malformed tone brief becomes null', () => {
    expect(sanitiseConfig({ toneBrief: 42 }).toneBrief).toBeNull();
    expect(sanitiseConfig({ toneBrief: '' }).toneBrief).toBeNull();
  });

  test('garbage input falls back to the baseline', () => {
    expect(sanitiseConfig(null)).toEqual(baselineConfig());
    expect(sanitiseConfig('what')).toEqual(baselineConfig());
  });
});
