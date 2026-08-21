import type { TokenUsage } from '../shared/types';
import { ClaudeProvider } from './providers/claude';
import { OllamaProvider } from './providers/ollama';
import { BedrockProvider } from './providers/bedrock';

// Provider-agnostic message model. The agent loop builds conversations out of
// these blocks and each provider maps them onto its own wire format.

export type MessageBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: MessageBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
}

export interface ConverseRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export interface ConverseResult {
  content: MessageBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: TokenUsage;
}

export interface AIProvider {
  converse(request: ConverseRequest): Promise<ConverseResult>;
}

let _provider: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (_provider) return _provider;
  const name = process.env.AI_PROVIDER ?? 'claude';
  switch (name) {
    case 'bedrock':
      // Used in the Skiller Whale hosted environment (LLM via the Bedrock proxy).
      _provider = new BedrockProvider();
      break;
    case 'ollama':
      _provider = new OllamaProvider();
      break;
    default:
      _provider = new ClaudeProvider();
  }
  console.log(`Using AI provider: ${name}`);
  return _provider;
}

/** Test seam: lets unit tests inject a mock provider. */
export function setProvider(provider: AIProvider | null): void {
  _provider = provider;
}
