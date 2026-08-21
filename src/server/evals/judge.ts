import type { JudgeVerdict, TokenUsage, ToneBrief } from '../../shared/types';
import { EMPTY_USAGE } from '../../shared/types';
import type { AIProvider } from '../ai';

const JUDGE_SYSTEM = [
  'You are grading one reply from a customer-support agent against a rubric.',
  'Judge only what the rubric asks about. Do not invent extra requirements.',
  'Respond with a single JSON object and nothing else, in this exact shape:',
  '{"verdict": "PASS" | "FAIL", "reason": "<one short sentence>"}',
].join('\n');

const TONE_JUDGE_SYSTEM = [
  'You are scoring one reply from a customer-support agent against a tone-of-voice brief.',
  'Score ONLY the tone, style, and voice of the reply — not whether its facts are right.',
  'Score 0–100: 100 means the reply reads exactly as the brief describes; 50 means a generic',
  'customer-service voice with no relationship to the brief; 0 means it actively contradicts the brief.',
  'Be strict about the specifics the brief names (punctuation habits, structure, sign-offs).',
  'Respond with a single JSON object and nothing else, in this exact shape:',
  '{"score": <0-100>, "reason": "<one short sentence>"}',
].join('\n');

export interface JudgeOutcome {
  verdict: JudgeVerdict;
  usage: TokenUsage;
}

export interface ToneScoreOutcome {
  score: number;
  reason: string;
  usage: TokenUsage;
}

/** Ask the model to grade an answer against a rubric. Deliberately boring:
 * temperature 0, tiny output, JSON only. Judges can still be wrong — that is
 * one of the things the session teaches. */
export async function judgeAnswer(
  provider: AIProvider,
  customerMessage: string,
  answer: string,
  rubric: string,
): Promise<JudgeOutcome> {
  const user = [
    `The customer wrote:\n${customerMessage}`,
    `The agent replied:\n${answer}`,
    `Rubric:\n${rubric}`,
    'Does the reply satisfy the rubric?',
  ].join('\n\n');

  try {
    const response = await provider.converse({
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens: 256,
      temperature: 0,
    });
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    return { verdict: parseVerdict(text), usage: response.usage };
  } catch (err) {
    return {
      verdict: {
        verdict: 'FAIL',
        reason: `The judge itself failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      usage: EMPTY_USAGE,
    };
  }
}

/** Ask the model to score an answer's tone against a brief, 0–100. */
export async function scoreTone(
  provider: AIProvider,
  customerMessage: string,
  answer: string,
  brief: ToneBrief,
): Promise<ToneScoreOutcome> {
  const user = [
    `The tone-of-voice brief ("${brief.name}"):\n${brief.brief}`,
    `The customer wrote:\n${customerMessage}`,
    `The agent replied:\n${answer}`,
    'How well does the reply match the brief?',
  ].join('\n\n');

  try {
    const response = await provider.converse({
      system: TONE_JUDGE_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      maxTokens: 256,
      temperature: 0,
    });
    const text = response.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    return { ...parseToneScore(text), usage: response.usage };
  } catch (err) {
    return {
      score: 0,
      reason: `The judge itself failed: ${err instanceof Error ? err.message : String(err)}`,
      usage: EMPTY_USAGE,
    };
  }
}

export function parseVerdict(text: string): JudgeVerdict {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.verdict === 'PASS' || parsed.verdict === 'FAIL') {
        return {
          verdict: parsed.verdict,
          reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        };
      }
    } catch {
      // fall through to the plain-text scan below
    }
  }
  // Fallback: some models narrate instead of returning clean JSON.
  if (/\bPASS\b/i.test(text) && !/\bFAIL\b/i.test(text)) {
    return { verdict: 'PASS', reason: 'Judge said PASS (loosely formatted).' };
  }
  return { verdict: 'FAIL', reason: `Could not parse the judge's verdict: ${text.slice(0, 120)}` };
}

export function parseToneScore(text: string): { score: number; reason: string } {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.score === 'number' && Number.isFinite(parsed.score)) {
        return {
          score: Math.max(0, Math.min(100, Math.round(parsed.score))),
          reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        };
      }
    } catch {
      // fall through to the plain-text scan below
    }
  }
  // Fallback: take the first number that looks like a score out of 100.
  const numberMatch = text.match(/\b(\d{1,3})\s*(?:\/\s*100|%)?\b/);
  if (numberMatch) {
    const value = Number(numberMatch[1]);
    if (value >= 0 && value <= 100) {
      return { score: value, reason: 'Score parsed from loosely formatted judge output.' };
    }
  }
  return { score: 0, reason: `Could not parse the judge's score: ${text.slice(0, 120)}` };
}
