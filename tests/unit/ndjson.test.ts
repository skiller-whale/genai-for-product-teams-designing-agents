import { describe, expect, test } from 'bun:test';
import { ndjson } from '../../src/server/ndjson';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readEvents(
  response: Response,
): Promise<Array<{ type: string; message?: string }>> {
  const body = await response.text();
  return body
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

describe('ndjson', () => {
  test('emits heartbeats while the producer is quiet', async () => {
    const response = ndjson(async (write) => {
      await write({ type: 'run_started' });
      await sleep(50);
      await write({ type: 'case_result' });
    }, 10);

    const events = await readEvents(response);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('run_started');
    expect(types[types.length - 1]).toBe('case_result');
    expect(types.filter((t) => t === 'heartbeat').length).toBeGreaterThan(0);
  });

  test('stops heartbeating once the producer finishes', async () => {
    const response = ndjson(async (write) => {
      await write({ type: 'done' });
    }, 10);

    const events = await readEvents(response);
    expect(events).toEqual([{ type: 'done' }]);
  });

  test('turns a producer error into an error event and still closes', async () => {
    const response = ndjson(async (write) => {
      await write({ type: 'run_started' });
      throw new Error('provider exploded');
    }, 10);

    const events = await readEvents(response);
    expect(events.map((e) => e.type)).toEqual(['run_started', 'error']);
    expect(events[1]).toEqual({ type: 'error', message: 'provider exploded' });
  });

  test('sets the NDJSON content type', () => {
    const response = ndjson(async () => {});
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson; charset=utf-8');
  });
});
