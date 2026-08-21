import type { AgentConfig, ToolInfo } from '../../shared/types';
import type { ToolSpec } from '../ai';
import { KB_DOCS, getBooking } from '../scenario';
import { searchWeb } from '../scenario/webResults';
import { formatKbHits, searchKb } from './kbSearch';
import { calculate } from './calculator';

export interface ToolContext {
  config: AgentConfig;
}

export interface ToolDefinition {
  info: ToolInfo;
  spec: ToolSpec;
  execute(input: Record<string, unknown>, context: ToolContext): string;
}

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required parameter '${key}'`);
  }
  return value;
}

const searchKnowledgeBase: ToolDefinition = {
  info: {
    id: 'search_knowledge_base',
    name: 'Search the knowledge base',
    description:
      "Searches the company's own policy documents and returns the most relevant passages. Precise, but only returns short snippets.",
  },
  spec: {
    name: 'search_knowledge_base',
    description:
      "Search the company's internal knowledge base (policies, tours, prices, terms) and return the most relevant passages with their document ids.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words or phrases to search for' },
      },
      required: ['query'],
    },
  },
  execute(input) {
    return formatKbHits(searchKb(str(input, 'query')));
  },
};

const readDocument: ToolDefinition = {
  info: {
    id: 'read_document',
    name: 'Read a whole document',
    description:
      'Reads one entire knowledge-base document. Complete and reliable, but whole documents use a lot more tokens than snippets.',
  },
  spec: {
    name: 'read_document',
    description:
      `Read the full text of one knowledge-base document. Available document ids: ${KB_DOCS.map((d) => d.id).join(', ')}.`,
    inputSchema: {
      type: 'object',
      properties: {
        doc_id: { type: 'string', description: 'The id of the document to read' },
      },
      required: ['doc_id'],
    },
  },
  execute(input) {
    const docId = str(input, 'doc_id').trim().toLowerCase();
    const doc = KB_DOCS.find((d) => d.id === docId);
    if (!doc) {
      throw new Error(
        `No document with id '${docId}'. Available ids: ${KB_DOCS.map((d) => d.id).join(', ')}`,
      );
    }
    return doc.content;
  },
};

const lookupBooking: ToolDefinition = {
  info: {
    id: 'lookup_booking',
    name: 'Look up a booking',
    description:
      "Fetches a customer's booking from the booking system by its reference (e.g. BF-1042): tour, date, party size, amount paid, membership tier.",
  },
  spec: {
    name: 'lookup_booking',
    description:
      'Look up a booking in the booking system by its reference (format: BF-nnnn). Returns the booking details, or an error if no such booking exists.',
    inputSchema: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'The booking reference, e.g. BF-1042' },
      },
      required: ['reference'],
    },
  },
  execute(input) {
    const reference = str(input, 'reference');
    const booking = getBooking(reference);
    if (!booking) {
      throw new Error(
        `No booking found with reference '${reference}'. Check the reference with the customer — it should look like BF-1042.`,
      );
    }
    return JSON.stringify(booking, null, 2);
  },
};

const calculator: ToolDefinition = {
  info: {
    id: 'calculator',
    name: 'Calculator',
    description:
      'Does exact arithmetic (+, -, ×, ÷, %, parentheses). Language models are surprisingly unreliable at maths on their own.',
  },
  spec: {
    name: 'calculator',
    description:
      'Evaluate an arithmetic expression exactly. Supports + - * / %, parentheses and decimals, e.g. "0.75 * 84" or "(60 * 2) * 1.2".',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'The expression to evaluate' },
      },
      required: ['expression'],
    },
  },
  execute(input) {
    const expression = str(input, 'expression');
    const value = calculate(expression);
    // Round to pennies for display: the answers here are prices.
    const rounded = Math.round(value * 100) / 100;
    return `${expression} = ${rounded}`;
  },
};

const searchTheWeb: ToolDefinition = {
  info: {
    id: 'search_the_web',
    name: 'Search the web',
    description:
      'Searches the public web and returns the top results. Broad reach — but the web contains old, wrong, and competitor-written pages.',
  },
  spec: {
    name: 'search_the_web',
    description:
      'Search the public web and return the top results (title, URL, snippet). Results may include pages from any website.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  execute(input) {
    const results = searchWeb(str(input, 'query'));
    return results
      .map((r) => `${r.title}\n${r.url}\n${r.snippet}`)
      .join('\n\n---\n\n');
  },
};

const loadSkill: ToolDefinition = {
  info: {
    id: 'load_skill',
    name: 'Load a skill',
    description:
      'Built-in: fetches the full text of one of your skills. The agent sees only skill names and descriptions until it loads one.',
    alwaysOn: true,
  },
  spec: {
    name: 'load_skill',
    description:
      'Load the full instructions for one of your named skills. Use this before handling a request that a skill covers.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the skill to load' },
      },
      required: ['name'],
    },
  },
  execute(input, context) {
    const name = str(input, 'name').trim().toLowerCase();
    const skill = context.config.skills.find((s) => s.name.trim().toLowerCase() === name);
    if (!skill) {
      const available = context.config.skills.map((s) => s.name).join(', ') || '(none)';
      throw new Error(`No skill named '${name}'. Available skills: ${available}`);
    }
    return `# Skill: ${skill.name}\n\n${skill.body}`;
  },
};

/** Every tool the Workbench offers, in display order. */
export const ALL_TOOLS: ToolDefinition[] = [
  searchKnowledgeBase,
  readDocument,
  lookupBooking,
  calculator,
  searchTheWeb,
  loadSkill,
];

export function toolInfos(): ToolInfo[] {
  return ALL_TOOLS.map((t) => t.info);
}

export function isValidToolId(id: string): boolean {
  return ALL_TOOLS.some((t) => t.info.id === id && !t.info.alwaysOn);
}

/** The tools available to the agent for a given config: the enabled toggles,
 * plus load_skill whenever the learner has written any skills. */
export function activeTools(config: AgentConfig): ToolDefinition[] {
  return ALL_TOOLS.filter(
    (tool) =>
      (tool.info.alwaysOn && config.skills.length > 0) ||
      (!tool.info.alwaysOn && config.enabledTools.includes(tool.info.id)),
  );
}

export function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): { result: string; isError: boolean } {
  const tool = ALL_TOOLS.find((t) => t.spec.name === name);
  if (!tool) {
    return { result: `Unknown tool: ${name}`, isError: true };
  }
  try {
    return { result: tool.execute(input, context), isError: false };
  } catch (err) {
    return { result: err instanceof Error ? err.message : String(err), isError: true };
  }
}
