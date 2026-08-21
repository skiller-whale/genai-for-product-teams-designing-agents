import { describe, expect, test } from 'bun:test';
import { calculate } from '../../src/server/agent/calculator';

describe('calculate', () => {
  test('basic arithmetic', () => {
    expect(calculate('2 + 3')).toBe(5);
    expect(calculate('10 - 4')).toBe(6);
    expect(calculate('6 * 7')).toBe(42);
    expect(calculate('84 / 2')).toBe(42);
  });

  test('operator precedence and parentheses', () => {
    expect(calculate('2 + 3 * 4')).toBe(14);
    expect(calculate('(2 + 3) * 4')).toBe(20);
    expect(calculate('(60 * 2) * 1.2')).toBe(144);
  });

  test('the refund sums the session leans on', () => {
    expect(calculate('0.75 * 84')).toBe(63);
    expect(calculate('84 * 75%')).toBe(63);
    expect(calculate('102 * 50%')).toBe(51);
    expect(calculate('30 * 15 * 1.2')).toBe(540);
    expect(calculate('540 * 25%')).toBe(135);
    expect(calculate('60 * 0.9 - 20')).toBe(34);
  });

  test('tolerates currency symbols and thousands commas', () => {
    expect(calculate('£120 * 2')).toBe(240);
    expect(calculate('1,000 + 1')).toBe(1001);
  });

  test('negative numbers', () => {
    expect(calculate('-5 + 3')).toBe(-2);
    expect(calculate('2 * -3')).toBe(-6);
  });

  test('rejects rubbish rather than evaluating it', () => {
    expect(() => calculate('')).toThrow();
    expect(() => calculate('process.exit(1)')).toThrow();
    expect(() => calculate('2 +')).toThrow();
    expect(() => calculate('(2 + 3')).toThrow();
    expect(() => calculate('1 / 0')).toThrow('Division by zero');
  });
});
