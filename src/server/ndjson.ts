/** Default gap between heartbeat events. Must stay comfortably under Bun's
 * 10s idleTimeout and any proxy's idle limit — the heartbeat is what keeps
 * long-quiet streams (an eval case is many LLM calls) from being cut off. */
const HEARTBEAT_MS = 5000;

/** Stream a sequence of JSON events as NDJSON (one JSON object per line).
 *
 * Emits a `{"type":"heartbeat"}` line every `heartbeatMs` so the connection
 * never looks idle to Bun or any proxy in front of it, however long the
 * producer takes between real events. Clients ignore heartbeat events. */
export function ndjson(
  producer: (write: (event: unknown) => Promise<void>) => Promise<void>,
  heartbeatMs: number = HEARTBEAT_MS,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      heartbeat = setInterval(() => enqueue({ type: 'heartbeat' }), heartbeatMs);
      try {
        await producer(async (event) => enqueue(event));
      } catch (err) {
        enqueue({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      // Client disconnected: stop the heartbeat and drop later writes.
      closed = true;
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
