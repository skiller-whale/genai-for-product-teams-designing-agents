import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  AIProvider,
  ChatMessage,
  ConverseRequest,
  ConverseResult,
  MessageBlock,
} from '../ai';

// In the Skiller Whale hosted environment, `bedrock_proxy: {}` in the module's
// exercise_config.yaml routes Bedrock calls through the proxy below. Auth uses
// the learner's attendance id as the AWS access key (secret is unused) — there
// is no real API key in the VM.
const ENDPOINT = process.env.BEDROCK_ENDPOINT ?? 'https://bedrock-runtime.aws-proxy.skillerwhale.com/';
const REGION = process.env.BEDROCK_REGION ?? 'eu-west-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0';

const client = new BedrockRuntimeClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: process.env.SW_ATTENDANCE_ID ?? '',
    secretAccessKey: 'unused',
  },
});

function toBedrockMessage(message: ChatMessage): Message {
  const content: ContentBlock[] = message.content.map((block): ContentBlock => {
    switch (block.type) {
      case 'text':
        return { text: block.text };
      case 'tool_use':
        return {
          toolUse: { toolUseId: block.id, name: block.name, input: block.input as any },
        };
      case 'tool_result':
        return {
          toolResult: {
            toolUseId: block.toolUseId,
            content: [{ text: block.content }],
            status: block.isError ? 'error' : 'success',
          },
        };
    }
  });
  return { role: message.role, content };
}

function fromBedrockContent(blocks: ContentBlock[]): MessageBlock[] {
  const result: MessageBlock[] = [];
  for (const block of blocks) {
    if (block.text !== undefined) {
      result.push({ type: 'text', text: block.text });
    } else if (block.toolUse) {
      result.push({
        type: 'tool_use',
        id: block.toolUse.toolUseId ?? '',
        name: block.toolUse.name ?? '',
        input: (block.toolUse.input ?? {}) as Record<string, unknown>,
      });
    }
  }
  return result;
}

export class BedrockProvider implements AIProvider {
  async converse(request: ConverseRequest): Promise<ConverseResult> {
    if (!process.env.SW_ATTENDANCE_ID) {
      throw new Error('SW_ATTENDANCE_ID is not set — the Bedrock proxy needs it as the access key.');
    }
    const tools: Tool[] | undefined = request.tools?.length
      ? request.tools.map((tool) => ({
          toolSpec: {
            name: tool.name,
            description: tool.description,
            inputSchema: { json: tool.inputSchema as any },
          },
        }))
      : undefined;

    const response = await client.send(
      new ConverseCommand({
        modelId: MODEL_ID,
        system: [{ text: request.system }],
        messages: request.messages.map(toBedrockMessage),
        ...(tools ? { toolConfig: { tools } } : {}),
        inferenceConfig: {
          maxTokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.1,
        },
      }),
    );

    const content = fromBedrockContent(response.output?.message?.content ?? []);
    const stopReason =
      response.stopReason === 'tool_use'
        ? 'tool_use'
        : response.stopReason === 'max_tokens'
          ? 'max_tokens'
          : 'end_turn';
    return {
      content,
      stopReason,
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
      },
    };
  }
}
