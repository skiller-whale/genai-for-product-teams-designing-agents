import { Ollama, type Message, type Tool } from 'ollama';
import type {
  AIProvider,
  ConverseRequest,
  ConverseResult,
  MessageBlock,
} from '../ai';

// Used only for local verification (e.g. the hosted-environment emulator,
// where there is no attendance id for the Bedrock proxy). Small local models
// handle tool calls shakily — treat this as a wiring smoke test, not a
// faithful reproduction of the hosted behaviour.
export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string;
  private nextToolUseId = 1;

  constructor() {
    this.client = new Ollama({
      host: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    });
    this.model = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
  }

  async converse(request: ConverseRequest): Promise<ConverseResult> {
    // Ollama has no tool_use ids: tool results are plain 'tool' role messages,
    // matched to calls by order. Flatten our block model accordingly.
    const messages: Message[] = [{ role: 'system', content: request.system }];
    for (const message of request.messages) {
      const textBlocks = message.content.filter((b) => b.type === 'text');
      const toolUses = message.content.filter((b) => b.type === 'tool_use');
      const toolResults = message.content.filter((b) => b.type === 'tool_result');

      if (message.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: textBlocks.map((b) => b.text).join('\n'),
          ...(toolUses.length
            ? {
                tool_calls: toolUses.map((b) => ({
                  function: { name: b.name, arguments: b.input },
                })),
              }
            : {}),
        });
      } else {
        for (const result of toolResults) {
          messages.push({ role: 'tool', content: result.content });
        }
        if (textBlocks.length) {
          messages.push({
            role: 'user',
            content: textBlocks.map((b) => b.text).join('\n'),
          });
        }
      }
    }

    const tools: Tool[] | undefined = request.tools?.length
      ? request.tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema as Tool['function']['parameters'],
          },
        }))
      : undefined;

    const response = await this.client.chat({
      model: this.model,
      messages,
      ...(tools ? { tools } : {}),
      options: { temperature: request.temperature ?? 0.1 },
    });

    const content: MessageBlock[] = [];
    if (response.message.content) {
      content.push({ type: 'text', text: response.message.content });
    }
    for (const call of response.message.tool_calls ?? []) {
      content.push({
        type: 'tool_use',
        id: `ollama-tool-use-${this.nextToolUseId++}`,
        name: call.function.name,
        input: (call.function.arguments ?? {}) as Record<string, unknown>,
      });
    }

    return {
      content,
      stopReason: response.message.tool_calls?.length ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: response.prompt_eval_count ?? 0,
        outputTokens: response.eval_count ?? 0,
      },
    };
  }
}
