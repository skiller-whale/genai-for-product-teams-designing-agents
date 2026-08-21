import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  ChatMessage,
  ConverseRequest,
  ConverseResult,
  MessageBlock,
} from '../ai';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

function toClaudeMessage(message: ChatMessage): Anthropic.MessageParam {
  const content: Anthropic.ContentBlockParam[] = message.content.map((block) => {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'tool_use':
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError ?? false,
        };
    }
  });
  return { role: message.role, content };
}

function fromClaudeContent(blocks: Anthropic.ContentBlock[]): MessageBlock[] {
  const result: MessageBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      result.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      result.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }
  return result;
}

export class ClaudeProvider implements AIProvider {
  async converse(request: ConverseRequest): Promise<ConverseResult> {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.1,
      system: request.system,
      messages: request.messages.map(toClaudeMessage),
      ...(request.tools?.length
        ? {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
            })),
          }
        : {}),
    });
    const stopReason =
      msg.stop_reason === 'tool_use'
        ? 'tool_use'
        : msg.stop_reason === 'max_tokens'
          ? 'max_tokens'
          : 'end_turn';
    return {
      content: fromClaudeContent(msg.content),
      stopReason,
      usage: {
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      },
    };
  }
}
