import { describe, expect, test } from 'bun:test';
import { formatKbHits, searchKb } from '../../src/server/agent/kbSearch';

describe('searchKb', () => {
  test('finds the refund policy for a refund query', () => {
    const hits = searchKb('refund cancellation notice');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.docId)).toContain('refund-policy');
  });

  test('finds the sighting guarantee', () => {
    const hits = searchKb('no whales sighted guarantee voucher');
    expect(hits[0].docId).toBe('sighting-guarantee');
  });

  test('caps the number of hits', () => {
    expect(searchKb('whale tour price refund').length).toBeLessThanOrEqual(3);
  });

  test('returns nothing for an empty or stop-word query', () => {
    expect(searchKb('')).toEqual([]);
    expect(searchKb('the and for')).toEqual([]);
  });
});

describe('formatKbHits', () => {
  test('includes doc ids so the agent can follow up with read_document', () => {
    const formatted = formatKbHits(searchKb('refund cancellation'));
    expect(formatted).toContain('[document: ');
  });

  test('explains itself when nothing matches', () => {
    expect(formatKbHits([])).toContain('No matching passages');
  });
});
