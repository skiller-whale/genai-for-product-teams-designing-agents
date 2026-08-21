import { describe, expect, test } from 'bun:test';
import { activeTools, executeTool } from '../../src/server/agent/tools';
import { baselineConfig } from '../../src/server/config/store';
import type { AgentConfig } from '../../src/shared/types';

const baseContext = { config: baselineConfig() };

describe('lookup_booking', () => {
  test('returns the booking details for a known reference', () => {
    const { result, isError } = executeTool('lookup_booking', { reference: 'BF-1042' }, baseContext);
    expect(isError).toBe(false);
    expect(result).toContain('Priya Chandra');
    expect(result).toContain('180');
  });

  test('is case-insensitive about the reference', () => {
    const { isError } = executeTool('lookup_booking', { reference: 'bf-1042' }, baseContext);
    expect(isError).toBe(false);
  });

  test('errors helpfully on an unknown reference', () => {
    const { result, isError } = executeTool('lookup_booking', { reference: 'BF-9999' }, baseContext);
    expect(isError).toBe(true);
    expect(result).toContain('No booking found');
  });
});

describe('read_document', () => {
  test('returns the full document', () => {
    const { result, isError } = executeTool('read_document', { doc_id: 'refund-policy' }, baseContext);
    expect(isError).toBe(false);
    expect(result).toContain('14 days or more');
  });

  test('lists valid ids on a miss', () => {
    const { result, isError } = executeTool('read_document', { doc_id: 'nope' }, baseContext);
    expect(isError).toBe(true);
    expect(result).toContain('refund-policy');
  });
});

describe('search_the_web', () => {
  test('a refund query surfaces the archived-policy trap', () => {
    const { result, isError } = executeTool('search_the_web', { query: 'barnacle fluke refund policy' }, baseContext);
    expect(isError).toBe(false);
    expect(result).toContain('archived');
  });
});

describe('load_skill', () => {
  const config: AgentConfig = {
    ...baselineConfig(),
    skills: [{ name: 'refunds', description: 'Refund sums.', body: 'Use the ladder.' }],
  };

  test('returns the skill body', () => {
    const { result, isError } = executeTool('load_skill', { name: 'refunds' }, { config });
    expect(isError).toBe(false);
    expect(result).toContain('Use the ladder.');
  });

  test('lists available skills on a miss', () => {
    const { result, isError } = executeTool('load_skill', { name: 'missing' }, { config });
    expect(isError).toBe(true);
    expect(result).toContain('refunds');
  });
});

describe('executeTool', () => {
  test('unknown tools error instead of throwing', () => {
    const { isError } = executeTool('not_a_tool', {}, baseContext);
    expect(isError).toBe(true);
  });

  test('missing parameters error instead of throwing', () => {
    const { isError } = executeTool('lookup_booking', {}, baseContext);
    expect(isError).toBe(true);
  });
});

describe('activeTools', () => {
  test('the blank-slate baseline exposes no tools at all', () => {
    const names = activeTools(baselineConfig()).map((t) => t.spec.name);
    expect(names).toEqual([]);
  });

  test('load_skill appears once the learner has written a skill', () => {
    const config: AgentConfig = {
      ...baselineConfig(),
      skills: [{ name: 's', description: 'd', body: 'b' }],
    };
    const names = activeTools(config).map((t) => t.spec.name);
    expect(names).toContain('load_skill');
  });

  test('toggled tools appear when enabled', () => {
    const config: AgentConfig = {
      ...baselineConfig(),
      enabledTools: ['search_knowledge_base', 'calculator', 'lookup_booking'],
    };
    const names = activeTools(config).map((t) => t.spec.name);
    expect(names).toEqual(
      expect.arrayContaining(['search_knowledge_base', 'calculator', 'lookup_booking']),
    );
    expect(names).not.toContain('search_the_web');
  });
});
