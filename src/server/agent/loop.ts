import type { AgentConfig, ChatEvent, TokenUsage, TranscriptStep } from '../../shared/types';
import { EMPTY_USAGE, addUsage } from '../../shared/types';
import type { AIProvider, ChatMessage, MessageBlock } from '../ai';
import { buildSystemPrompt } from './systemPrompt';
import { activeTools, executeTool } from './tools';

// Safety valve: the most provider round-trips one customer message may take.
// Ten is generous — a healthy agent rarely needs more than four or five.
export const MAX_LLM_CALLS = 10;

export interface AgentRunResult {
  finalText: string;
  transcript: TranscriptStep[];
  usage: TokenUsage;
  llmCalls: number;
}

export interface AgentRunOptions {
  provider: AIProvider;
  config: AgentConfig;
  /** Prior conversation plus the new user message, as plain-text turns. */
  messages: ChatMessage[];
  maxTokens?: number;
  /** Called for each visible step, for NDJSON streaming. Optional. */
  onEvent?: (event: ChatEvent) => void | Promise<void>;
}

/** Run the tool-use loop for one customer message and return the transcript.
 * Every LLM call and tool execution is surfaced through onEvent so the UI can
 * show the agent working step by step. */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { provider, config, onEvent } = options;
  const emit = async (event: ChatEvent) => {
    if (onEvent) await onEvent(event);
  };

  const system = buildSystemPrompt(config);
  const tools = activeTools(config).map((t) => t.spec);
  const messages: ChatMessage[] = [...options.messages];

  const transcript: TranscriptStep[] = [];
  const textParts: string[] = [];
  let usage = EMPTY_USAGE;
  let llmCalls = 0;

  while (llmCalls < MAX_LLM_CALLS) {
    const response = await provider.converse({
      system,
      messages,
      tools,
      maxTokens: options.maxTokens ?? 1024,
    });
    llmCalls += 1;
    usage = addUsage(usage, response.usage);
    await emit({ type: 'usage', usage: response.usage });

    const toolUses: Extract<MessageBlock, { type: 'tool_use' }>[] = [];
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        textParts.push(block.text);
        transcript.push({ kind: 'text', text: block.text });
        await emit({ type: 'assistant_text', text: block.text });
      } else if (block.type === 'tool_use') {
        toolUses.push(block);
      }
    }

    if (response.stopReason !== 'tool_use' || toolUses.length === 0) {
      break;
    }

    // Execute the requested tools and hand the results back to the model.
    messages.push({ role: 'assistant', content: response.content });
    const resultBlocks: MessageBlock[] = [];
    for (const toolUse of toolUses) {
      await emit({ type: 'tool_call', tool: toolUse.name, input: toolUse.input });
      const { result, isError } = executeTool(toolUse.name, toolUse.input, { config });
      transcript.push({
        kind: 'tool_call',
        tool: toolUse.name,
        input: toolUse.input,
        result,
        isError: isError || undefined,
      });
      await emit({ type: 'tool_result', tool: toolUse.name, result, isError: isError || undefined });
      resultBlocks.push({
        type: 'tool_result',
        toolUseId: toolUse.id,
        content: result,
        isError,
      });
    }
    messages.push({ role: 'user', content: resultBlocks });
  }

  let finalText = textParts.join('\n\n').trim();
  if (!finalText) {
    finalText =
      llmCalls >= MAX_LLM_CALLS
        ? '(The agent hit its step limit without producing an answer.)'
        : '(The agent produced no reply.)';
    transcript.push({ kind: 'text', text: finalText });
    await emit({ type: 'assistant_text', text: finalText });
  }

  await emit({ type: 'done', finalText, usage, llmCalls });
  return { finalText, transcript, usage, llmCalls };
}
