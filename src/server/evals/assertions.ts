import type { TranscriptStep } from '../../shared/types';
import type { Assertion } from './cases';

/** Run one deterministic assertion against the agent's answer + transcript.
 * Returns null on pass, or a human-readable failure reason. */
export function checkAssertion(
  assertion: Assertion,
  answer: string,
  transcript: TranscriptStep[],
): string | null {
  const haystack = answer.toLowerCase();
  switch (assertion.type) {
    case 'contains_any': {
      const found = assertion.values.some((v) => haystack.includes(v.toLowerCase()));
      return found
        ? null
        : `The answer never mentions ${assertion.values.map((v) => `"${v}"`).join(' or ')}.`;
    }
    case 'not_contains': {
      const offender = assertion.values.find((v) => haystack.includes(v.toLowerCase()));
      return offender === undefined ? null : `The answer mentions "${offender}", which it must not.`;
    }
    case 'tool_called': {
      const called = transcript.some(
        (step) => step.kind === 'tool_call' && step.tool === assertion.tool,
      );
      return called ? null : `The agent never used the ${assertion.tool} tool.`;
    }
  }
}

export function checkAssertions(
  assertions: Assertion[],
  answer: string,
  transcript: TranscriptStep[],
): string[] {
  return assertions
    .map((a) => checkAssertion(a, answer, transcript))
    .filter((failure): failure is string => failure !== null);
}
