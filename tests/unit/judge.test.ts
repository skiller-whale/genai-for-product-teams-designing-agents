import { describe, expect, test } from 'bun:test';
import { parseToneScore, parseVerdict } from '../../src/server/evals/judge';

describe('parseVerdict', () => {
  test('reads clean JSON', () => {
    expect(parseVerdict('{"verdict": "PASS", "reason": "Good."}')).toEqual({
      verdict: 'PASS',
      reason: 'Good.',
    });
  });

  test('falls back to a plain-text PASS', () => {
    expect(parseVerdict('I think this is a PASS overall.').verdict).toBe('PASS');
  });

  test('anything unparseable fails safe', () => {
    expect(parseVerdict('beep boop').verdict).toBe('FAIL');
  });
});

describe('parseToneScore', () => {
  test('reads clean JSON', () => {
    expect(parseToneScore('{"score": 85, "reason": "Salty."}')).toEqual({
      score: 85,
      reason: 'Salty.',
    });
  });

  test('clamps out-of-range scores', () => {
    expect(parseToneScore('{"score": 250, "reason": "!"}').score).toBe(100);
    expect(parseToneScore('{"score": -3, "reason": "!"}').score).toBe(0);
  });

  test('falls back to the first plausible number', () => {
    expect(parseToneScore('I would give this 72/100.').score).toBe(72);
  });

  test('anything unparseable scores zero', () => {
    expect(parseToneScore('no numbers here').score).toBe(0);
  });
});
