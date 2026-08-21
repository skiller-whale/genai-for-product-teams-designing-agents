import { describe, expect, test } from 'bun:test';
import { EVAL_CASES, casesForBlock } from '../../src/server/evals/cases';
import { ALL_TOOLS } from '../../src/server/agent/tools';
import { MODES } from '../../src/shared/types';
import { BOOKINGS, KB_DOCS, getBooking } from '../../src/server/scenario';
import { TONE_BRIEFS } from '../../src/server/scenario/toneBriefs';

// The eval cases assert exact figures. These tests pin the fixtures those
// figures are derived from, so nobody can edit the scenario data (or the
// cases) without noticing they've broken the other half.

describe('eval case integrity', () => {
  test('every booking reference mentioned in a case input exists (except the deliberate BF-9999)', () => {
    for (const evalCase of EVAL_CASES) {
      const refs = evalCase.input.match(/BF-\d+/g) ?? [];
      for (const ref of refs) {
        if (ref === 'BF-9999') continue;
        expect(getBooking(ref), `${evalCase.id} references ${ref}`).toBeDefined();
      }
    }
  });

  test('tool_called assertions name real tools', () => {
    const toolNames = ALL_TOOLS.map((t) => t.spec.name);
    for (const evalCase of EVAL_CASES) {
      for (const assertion of evalCase.assertions) {
        if (assertion.type === 'tool_called') {
          expect(toolNames).toContain(assertion.tool);
        }
      }
    }
  });

  test('case ids are unique', () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every block except investigation-onwards has cases, sized for a live session', () => {
    for (const mode of MODES) {
      const block = casesForBlock(mode.id);
      expect(block.length, `${mode.id} block`).toBeGreaterThanOrEqual(5);
      expect(block.length, `${mode.id} block`).toBeLessThanOrEqual(7);
    }
  });

  test('prompt-block cases are tone-scored and nothing else is', () => {
    for (const evalCase of EVAL_CASES) {
      if (evalCase.block === 'prompt') {
        expect(evalCase.toneScored, evalCase.id).toBe(true);
        expect(evalCase.assertions, evalCase.id).toEqual([]);
        expect(evalCase.rubric, evalCase.id).toBeUndefined();
      } else {
        expect(evalCase.toneScored, evalCase.id).toBeUndefined();
      }
    }
  });

  test('tone brief ids are unique and non-empty', () => {
    const ids = TONE_BRIEFS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const brief of TONE_BRIEFS) {
      expect(brief.name.length).toBeGreaterThan(0);
      expect(brief.brief.length).toBeGreaterThan(0);
    }
  });
});

describe('the arithmetic behind the asserted figures', () => {
  test('refund at 10 days notice: BF-1017 → 75% of £84 = £63 (investigation + skills)', () => {
    const booking = getBooking('BF-1017')!;
    expect(booking.amountPaidGbp).toBe(84);
    expect(booking.date).toBe('2026-07-24'); // 10 days after the simulated 14 July
    expect(booking.amountPaidGbp * 0.75).toBe(63);
  });

  test('booking lookup: BF-1042 paid £180 (investigation + tools)', () => {
    expect(getBooking('BF-1042')!.amountPaidGbp).toBe(180);
  });

  test('refund at 8 days notice: BF-1027 → 75% of £72 = £54 (tools)', () => {
    const booking = getBooking('BF-1027')!;
    expect(booking.date).toBe('2026-07-22'); // 8 days out: the 7–13 day band
    expect(booking.amountPaidGbp).toBe(72);
    expect(booking.amountPaidGbp * 0.75).toBe(54);
  });

  test('web-trap: BF-1101 on Thursday 17 July at 3 days notice → 50% of £120 = £60 (tools)', () => {
    const booking = getBooking('BF-1101')!;
    expect(booking.date).toBe('2026-07-17');
    expect(booking.amountPaidGbp * 0.5).toBe(60);
  });

  test('weather-vs-customer: BF-1088 is Saturday 18 July, in the 48h–6d band → £120 (rules + skills)', () => {
    const booking = getBooking('BF-1088')!;
    expect(booking.date).toBe('2026-07-18');
    expect(booking.amountPaidGbp * 0.5).toBe(120);
  });

  test('orca floor: BF-1051 is an Orca member sailing tomorrow; 50% floor = £51 (rules + skills)', () => {
    const booking = getBooking('BF-1051')!;
    expect(booking.membershipTier).toBe('orca');
    expect(booking.date).toBe('2026-07-15');
    expect(booking.amountPaidGbp * 0.5).toBe(51);
  });

  test('child rate on the Half-Day Humpback is £24 (rules)', () => {
    const tours = KB_DOCS.find((d) => d.id === 'tours')!;
    expect(tours.content).toContain('£24 child');
  });

  test('group-festival: 30 pupils × £15 school rate × 1.2 surcharge = £540, deposit £135 (investigation + skills)', () => {
    const schoolRate = 25 * 0.6; // 40% off the £25 Harbour Hop adult price
    expect(schoolRate).toBe(15);
    const total = 30 * schoolRate * 1.2;
    expect(total).toBe(540);
    expect(total * 0.25).toBe(135);
  });

  test('voucher-stacking: £60 with 10% Dolphin discount then £20 voucher = £34 (skills)', () => {
    expect(60 * 0.9 - 20).toBe(34);
  });

  test('reschedule-into-festival: BF-1031 is a Dolphin member outside Festival Week (skills)', () => {
    const booking = getBooking('BF-1031')!;
    expect(booking.membershipTier).toBe('dolphin');
    expect(booking.date).toBe('2026-08-15'); // outside 20–26 July, so the move is INTO Festival Week
  });

  test('silent retreat is £85 for 4 hours (tools + cost)', () => {
    const tours = KB_DOCS.find((d) => d.id === 'tours')!;
    expect(tours.content).toContain('Price: £85');
    expect(tours.content).toContain('Duration: 4 hours');
  });

  test('family-festival: 2 adults + 2 children on the Harbour Hop × 1.2 surcharge = £84 (cost)', () => {
    expect((2 * 25 + 2 * 10) * 1.2).toBe(84);
  });

  test('membership maths at 10 Humpback trips: Dolphin wins (cost)', () => {
    const spend = 10 * 60;
    expect(spend * 0.05 - 20).toBe(10); // Barnacle nets £10
    expect(spend * 0.1 - 45).toBe(15); // Dolphin nets £15 — the winner
    expect(spend * 0.15 - 90).toBe(0); // Orca nets nothing
  });

  test('rambling refund: BF-1003 on Sunday 19 July at 5 days notice → 50% of £114 = £57 (cost)', () => {
    const booking = getBooking('BF-1003')!;
    expect(booking.date).toBe('2026-07-19');
    expect(booking.amountPaidGbp).toBe(114);
    expect(booking.amountPaidGbp * 0.5).toBe(57);
  });

  test('parking lives in the FAQ: Kipper Lane at £6 all day (tools + cost)', () => {
    const faq = KB_DOCS.find((d) => d.id === 'faq')!;
    expect(faq.content).toContain('Kipper Lane');
    expect(faq.content).toContain('£6 all-day');
  });
});

describe('scenario data sanity', () => {
  test('the knowledge base has the 12 expected documents', () => {
    expect(KB_DOCS).toHaveLength(12);
    expect(KB_DOCS.map((d) => d.id)).toEqual(
      expect.arrayContaining(['tours', 'refund-policy', 'weather-policy', 'membership']),
    );
  });

  test('booking references are unique', () => {
    const refs = BOOKINGS.map((b) => b.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });
});
