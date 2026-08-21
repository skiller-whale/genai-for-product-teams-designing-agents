import { describe, expect, test } from 'bun:test';
import { COST_BLOCK_BUDGET_USD, COST_BUDGET_LEVELS } from '../../src/server/evals/cases';
import { budgetLevelReached, nextBudgetLevel } from '../../src/shared/pricing';

// The cost block's budget ladder. The exact figures are meant to be retuned
// against the hosted model, so these tests pin the shape of the ladder rather
// than the numbers — except the top level, which the teaching materials name.

describe('the budget ladder', () => {
  test('has a top level of $0.25 — the core task the session sets', () => {
    expect(COST_BLOCK_BUDGET_USD).toBe(0.25);
    expect(COST_BUDGET_LEVELS[0].usd).toBe(COST_BLOCK_BUDGET_USD);
  });

  test('offers stretch levels below the top, strictly descending', () => {
    expect(COST_BUDGET_LEVELS.length).toBeGreaterThan(1);
    for (let i = 1; i < COST_BUDGET_LEVELS.length; i++) {
      expect(COST_BUDGET_LEVELS[i].usd).toBeLessThan(COST_BUDGET_LEVELS[i - 1].usd);
    }
  });

  test('every level has a distinct name and a positive figure', () => {
    const names = COST_BUDGET_LEVELS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    for (const level of COST_BUDGET_LEVELS) {
      expect(level.usd).toBeGreaterThan(0);
    }
  });
});

const LEVELS = [
  { name: 'Budget', usd: 0.25 },
  { name: 'Lean', usd: 0.15 },
  { name: 'Frugal', usd: 0.1 },
];

describe('budgetLevelReached', () => {
  test('reports the tightest level the run came in under', () => {
    expect(budgetLevelReached(LEVELS, 0.2)?.name).toBe('Budget');
    expect(budgetLevelReached(LEVELS, 0.12)?.name).toBe('Lean');
    expect(budgetLevelReached(LEVELS, 0.04)?.name).toBe('Frugal');
  });

  test('a run exactly on a level counts as under it', () => {
    expect(budgetLevelReached(LEVELS, 0.25)?.name).toBe('Budget');
    expect(budgetLevelReached(LEVELS, 0.15)?.name).toBe('Lean');
    expect(budgetLevelReached(LEVELS, 0.1)?.name).toBe('Frugal');
  });

  test('is null when the run missed every level', () => {
    expect(budgetLevelReached(LEVELS, 0.26)).toBeNull();
    expect(budgetLevelReached([], 0.01)).toBeNull();
  });
});

describe('nextBudgetLevel', () => {
  test('points at the next level down from the one reached', () => {
    expect(nextBudgetLevel(LEVELS, 0.2)?.name).toBe('Lean');
    expect(nextBudgetLevel(LEVELS, 0.12)?.name).toBe('Frugal');
  });

  test('is null once the tightest level is reached — nothing left to chase', () => {
    expect(nextBudgetLevel(LEVELS, 0.04)).toBeNull();
  });

  test('points at the top level when the run is over budget', () => {
    expect(nextBudgetLevel(LEVELS, 0.4)?.name).toBe('Budget');
  });
});
