import { describe, expect, test } from 'bun:test';
import { MAX_LLM_CALLS, runAgent } from '../../src/server/agent/loop';
import type { AIProvider, ConverseRequest, ConverseResult } from '../../src/server/ai';
import { baselineConfig } from '../../src/server/config/store';
import type { ChatEvent } from '../../src/shared/types';

const USER_MESSAGE = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'Hello' }] },
];

function mockProvider(responses: ConverseResult[]): AIProvider & { requests: ConverseRequest[] } {
  const requests: ConverseRequest[] = [];
  let call = 0;
  return {
    requests,
    async converse(request) {
      requests.push(request);
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return response;
    },
  };
}

const textResponse = (text: string): ConverseResult => ({
  content: [{ type: 'text', text }],
  stopReason: 'end_turn',
  usage: { inputTokens: 100, outputTokens: 20 },
});

const toolResponse = (name: string, input: Record<string, unknown>): ConverseResult => ({
  content: [
    { type: 'text', text: 'Let me check.' },
    { type: 'tool_use', id: 'tu-1', name, input },
  ],
  stopReason: 'tool_use',
  usage: { inputTokens: 100, outputTokens: 30 },
});

describe('runAgent', () => {
  test('a plain answer finishes in one call', async () => {
    const provider = mockProvider([textResponse('Hello there!')]);
    const run = await runAgent({ provider, config: baselineConfig(), messages: USER_MESSAGE });
    expect(run.finalText).toBe('Hello there!');
    expect(run.llmCalls).toBe(1);
    expect(run.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  test('tool use executes the tool and feeds the result back', async () => {
    const provider = mockProvider([
      toolResponse('search_knowledge_base', { query: 'refund' }),
      textResponse('You get 75% back.'),
    ]);
    const run = await runAgent({ provider, config: baselineConfig(), messages: USER_MESSAGE });

    expect(run.llmCalls).toBe(2);
    expect(run.finalText).toContain('You get 75% back.');
    const toolSteps = run.transcript.filter((s) => s.kind === 'tool_call');
    expect(toolSteps).toHaveLength(1);
    expect(toolSteps[0]).toMatchObject({ tool: 'search_knowledge_base' });

    // The second request must carry the assistant's tool_use and our tool_result.
    const followUp = provider.requests[1];
    const lastMessage = followUp.messages[followUp.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content[0].type).toBe('tool_result');
  });

  test('usage accumulates across calls', async () => {
    const provider = mockProvider([
      toolResponse('search_knowledge_base', { query: 'refund' }),
      textResponse('Done.'),
    ]);
    const run = await runAgent({ provider, config: baselineConfig(), messages: USER_MESSAGE });
    expect(run.usage).toEqual({ inputTokens: 200, outputTokens: 50 });
  });

  test('the loop stops at MAX_LLM_CALLS even if the model keeps asking for tools', async () => {
    const provider = mockProvider([toolResponse('search_knowledge_base', { query: 'refund' })]);
    const run = await runAgent({ provider, config: baselineConfig(), messages: USER_MESSAGE });
    expect(run.llmCalls).toBe(MAX_LLM_CALLS);
  });

  test('events stream in order and end with done', async () => {
    const provider = mockProvider([
      toolResponse('search_knowledge_base', { query: 'refund' }),
      textResponse('Answer.'),
    ]);
    const events: ChatEvent[] = [];
    await runAgent({
      provider,
      config: baselineConfig(),
      messages: USER_MESSAGE,
      onEvent: (e) => {
        events.push(e);
      },
    });
    const types = events.map((e) => e.type);
    expect(types[types.length - 1]).toBe('done');
    expect(types).toContain('tool_call');
    expect(types).toContain('tool_result');
    expect(types.indexOf('tool_call')).toBeLessThan(types.indexOf('tool_result'));
  });

  test('a tool-use failure is reported to the model, not thrown', async () => {
    const provider = mockProvider([
      toolResponse('lookup_booking', { reference: 'BF-9999' }),
      textResponse('I could not find that booking.'),
    ]);
    const run = await runAgent({ provider, config: baselineConfig(), messages: USER_MESSAGE });
    const toolStep = run.transcript.find((s) => s.kind === 'tool_call');
    expect(toolStep).toMatchObject({ isError: true });
    expect(run.finalText).toContain('could not find');
  });
});
