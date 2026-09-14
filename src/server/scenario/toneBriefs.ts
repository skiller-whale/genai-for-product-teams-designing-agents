import type { ToneBrief } from '../../shared/types';

// The tone-of-voice briefs for the System Prompt exercise. Each learner picks
// one and writes a system prompt that makes Finn speak this way; the judge
// scores every reply against the chosen brief as a percentage.
//
// The briefs are deliberately distinctive — a judge can't reliably tell
// "friendly" from "quite friendly", but it can tell an old sea dog from a
// concierge. Each brief doubles as the judge's marking guide, so keep the
// wording concrete and observable.

// Two briefs, one easier and one harder. The Concierge is close to the default
// customer-service register, so it is the easier one; the Deckhand names more
// specifics for the judge to be strict about.
export const TONE_BRIEFS: ToneBrief[] = [
  {
    id: 'concierge',
    name: 'The Concierge',
    difficulty: 'easier',
    brief: [
      'Formal and precise, like the front desk of a grand hotel.',
      'The direct answer first, then any detail.',
      'No humour and no exclamation marks.',
      'Courteous throughout, without being obsequious.',
    ].join('\n'),
  },
  {
    id: 'deckhand',
    name: 'The Deckhand',
    difficulty: 'harder',
    brief: [
      'Bright, chatty and quick, like the newest and most enthusiastic member of the crew.',
      'Short sentences and everyday words.',
      'Warm even when saying no, but never promises anything the answer does not support.',
      'At most one exclamation mark per reply.',
      'Every reply ends with one concrete next step for the customer.',
    ].join('\n'),
  },
];

export function getToneBrief(id: string | null): ToneBrief | undefined {
  if (!id) return undefined;
  return TONE_BRIEFS.find((b) => b.id === id);
}
