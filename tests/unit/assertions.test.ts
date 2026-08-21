import { describe, expect, test } from 'bun:test';
import { checkAssertion, checkAssertions } from '../../src/server/evals/assertions';
import { parseVerdict } from '../../src/server/evals/judge';
import type { TranscriptStep } from '../../src/shared/types';

const transcript: TranscriptStep[] = [
  { kind: 'text', text: 'Let me check.' },
  { kind: 'tool_call', tool: 'lookup_booking', input: { reference: 'BF-1042' }, result: '{...}' },
  { kind: 'text', text: 'You paid £180.' },
];

describe('checkAssertion', () => {
  test('contains_any passes when any value appears (case-insensitive)', () => {
    expect(checkAssertion({ type: 'contains_any', values: ['£180', 'x'] }, 'you paid £180', [])).toBeNull();
    expect(checkAssertion({ type: 'contains_any', values: ['£180'] }, 'You Paid £180.', [])).toBeNull();
    expect(checkAssertion({ type: 'contains_any', values: ['£999'] }, 'you paid £180', [])).toContain('never mentions');
  });

  test('not_contains fails when a forbidden value appears', () => {
    expect(checkAssertion({ type: 'not_contains', values: ['100%'] }, 'You get 50% back.', [])).toBeNull();
    expect(checkAssertion({ type: 'not_contains', values: ['100%'] }, 'A 100% refund!', [])).toContain('must not');
  });

  test('tool_called inspects the transcript', () => {
    expect(checkAssertion({ type: 'tool_called', tool: 'lookup_booking' }, '', transcript)).toBeNull();
    expect(checkAssertion({ type: 'tool_called', tool: 'calculator' }, '', transcript)).toContain('never used');
  });
});

describe('checkAssertions', () => {
  test('collects every failure', () => {
    const failures = checkAssertions(
      [
        { type: 'contains_any', values: ['£63'] },
        { type: 'tool_called', tool: 'calculator' },
      ],
      'you get £50 back',
      transcript,
    );
    expect(failures).toHaveLength(2);
  });
});

describe('parseVerdict', () => {
  test('parses clean JSON', () => {
    expect(parseVerdict('{"verdict": "PASS", "reason": "Fine."}')).toEqual({
      verdict: 'PASS',
      reason: 'Fine.',
    });
  });

  test('parses JSON buried in narration', () => {
    const verdict = parseVerdict('Sure! Here is my grading:\n{"verdict": "FAIL", "reason": "Wrong amount."}');
    expect(verdict.verdict).toBe('FAIL');
  });

  test('falls back to a bare PASS token', () => {
    expect(parseVerdict('PASS - looks good').verdict).toBe('PASS');
  });

  test('unparseable output fails closed', () => {
    expect(parseVerdict('beats me').verdict).toBe('FAIL');
  });
});
