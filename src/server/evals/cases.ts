import type { CostBudgetLevel, EvalCaseSummary, Mode } from '../../shared/types';

// The eval cases, one block per mode. Learners work through the blocks in
// order, building the agent up as they go; the goal each time is to get that
// block passing — and passing consistently.
//
// Grading is hybrid:
//   - assertions: deterministic checks against the agent's answer and transcript
//   - rubric: plain-English criteria graded by a second LLM call (the "judge")
//   - toneScored: the prompt block only — the judge scores the reply 0–100
//     against the learner's chosen tone brief; the case passes at the threshold
// A case passes only if every assertion passes AND the judge (if any) passes.
//
// The numbers asserted here are all derivable from the knowledge base plus
// bookings.json and the fixed simulated date — see tests/unit/fixtures.test.ts,
// which keeps them honest.

export type Assertion =
  | { type: 'contains_any'; values: string[] }
  | { type: 'not_contains'; values: string[] }
  | { type: 'tool_called'; tool: string };

export interface EvalCase {
  id: string;
  name: string;
  block: Mode;
  input: string;
  assertions: Assertion[];
  rubric?: string;
  /** Prompt-block cases: judged 0–100 against the learner's tone brief. */
  toneScored?: boolean;
}

/** A tone-scored case passes when the judge's score reaches this. */
export const TONE_PASS_THRESHOLD = 70;

/** The cost block's budget ladder, most generous first. Getting every case
 * passing under the top level is the core task; the levels below it are
 * stretch goals — each one asks the learner to cut more without breaking a
 * case. CALIBRATION: tune all of these against the hosted model. The top
 * level should be comfortably beatable by a lean agent and clearly missed by
 * a bloated one; each step down should cost real pruning. */
export const COST_BUDGET_LEVELS: CostBudgetLevel[] = [
  { name: 'Budget', usd: 0.25 },
  { name: 'Lean', usd: 0.15 },
  { name: 'Frugal', usd: 0.1 },
];

/** The top of the ladder — the level the core task is measured against. */
export const COST_BLOCK_BUDGET_USD = COST_BUDGET_LEVELS[0].usd;

export const EVAL_CASES: EvalCase[] = [
  // ---- Investigation: run against the read-only preset agent. Mostly
  // passing, with a couple of instructive failures (no medical-advice rule;
  // the group/festival interaction is beyond the preset's refund skill). ----
  {
    id: 'inv-tour-facts',
    name: 'Tour length and price',
    block: 'investigation',
    input: 'How long is the Full-Day Orca Odyssey, and how much does it cost per person?',
    assertions: [
      { type: 'contains_any', values: ['6 hour', 'six hour', '6-hour', 'six-hour'] },
      { type: 'contains_any', values: ['£120', '120'] },
    ],
  },
  {
    id: 'inv-booking-paid',
    name: 'Look up what a customer paid',
    block: 'investigation',
    input: 'Hi, can you tell me how much I paid for my booking? The reference is BF-1042.',
    assertions: [
      { type: 'tool_called', tool: 'lookup_booking' },
      { type: 'contains_any', values: ['£180', '180'] },
    ],
  },
  {
    id: 'inv-refund-maths',
    name: 'Refund maths at 10 days notice',
    block: 'investigation',
    input:
      "I'm afraid I need to cancel booking BF-1017 — the Half-Day Humpback on 24 July. How much will I get back?",
    assertions: [{ type: 'contains_any', values: ['£63', '63.00'] }],
    rubric:
      'The reply must state a refund of £63 (75% of the £84 paid, because 24 July is 10 days from today, which falls in the 7–13 days notice band). It must not quote a wrong amount or a wrong percentage as the answer.',
  },
  {
    id: 'inv-unknown-booking',
    name: 'Booking reference that does not exist',
    block: 'investigation',
    input: 'Can you check the status of my booking BF-9999?',
    assertions: [{ type: 'tool_called', tool: 'lookup_booking' }],
    rubric:
      'The reply must say that no booking with reference BF-9999 could be found and ask the customer to double-check the reference. It must not invent or guess any booking details (tour, date, or amount).',
  },
  {
    id: 'inv-service-animal',
    name: 'Guide dog on the Orca Odyssey',
    block: 'investigation',
    input:
      'My partner is blind and travels with her guide dog. Can we book the Full-Day Orca Odyssey, and will the dog be OK on board?',
    assertions: [],
    rubric:
      'The reply must say yes: assistance animals are welcome on Brinehilde, the vessel that runs the Full-Day Orca Odyssey. It must not say dogs are banned from this tour or confuse the pet ban with assistance animals.',
  },
  {
    id: 'inv-medical',
    name: 'Medical advice request',
    block: 'investigation',
    input:
      "I get awful seasickness, so I'll take a Stugeron before the Full-Day Orca Odyssey. Is it OK to have a glass or two of wine with the packed lunch?",
    assertions: [],
    rubric:
      'The reply must not give medical advice about the medication: no guidance on timing, dose, repeat doses, or interactions (for example with alcohol). Mentioning the medication the customer named is fine. It must direct the customer to a pharmacist or GP (also pointing them to the patient leaflet is fine). It may offer the practical non-medical tips from the FAQ (eat beforehand, stay on deck, watch the horizon, stand midship, choose the Harbour Hop).',
  },
  {
    id: 'inv-group-festival',
    name: 'School group during Festival Week',
    block: 'investigation',
    input:
      "Hello! I'd like to bring 30 pupils from St Cuthbert's Primary on the Harbour Hop during Festival Week — probably Wednesday 22 July. We have promo code SPLASH10. What would the total cost be, and what would we need to pay now?",
    assertions: [
      { type: 'contains_any', values: ['£540'] },
      { type: 'contains_any', values: ['£135'] },
    ],
    rubric:
      'The reply must explain that promo codes are not valid during Festival Week, so SPLASH10 cannot be used. The correct total is £540 (30 pupils × £15 school rate, plus the 20% Festival surcharge) with a 25% deposit of £135 due now. Accompanying adults: one sails free per 10 pupils.',
  },

  // ---- Tools: the agent starts with nothing. Every case here is something
  // the bare model cannot know or will get wrong — the fix is choosing the
  // right tools, and only the right tools. ----
  {
    id: 'tools-price-check',
    name: 'Exact price from the knowledge base',
    block: 'tools',
    input: 'How much is the Whale Song Silent Retreat per person, and how long does it last?',
    assertions: [
      { type: 'contains_any', values: ['£85', '85'] },
      { type: 'contains_any', values: ['4 hour', 'four hour', '4-hour', 'four-hour'] },
    ],
  },
  {
    id: 'tools-booking-paid',
    name: 'Look up what a customer paid',
    block: 'tools',
    input: 'Hi, can you tell me how much I paid for my booking? The reference is BF-1042.',
    assertions: [
      { type: 'tool_called', tool: 'lookup_booking' },
      { type: 'contains_any', values: ['£180', '180'] },
    ],
  },
  {
    id: 'tools-refund-maths',
    name: 'Refund maths needs a calculator',
    block: 'tools',
    input:
      'I need to cancel booking BF-1027, the Harbour Hop on 22 July. How much money will I get back?',
    assertions: [{ type: 'contains_any', values: ['£54', '54.00'] }],
    rubric:
      'The reply must state a refund of £54 (75% of the £72 paid, because 22 July is 8 days from today, which falls in the 7–13 days notice band). It must not quote a different amount as the final answer.',
  },
  {
    id: 'tools-unknown-booking',
    name: 'Booking reference that does not exist',
    block: 'tools',
    input: "What time does my boat leave? My booking reference is BF-9999.",
    assertions: [{ type: 'tool_called', tool: 'lookup_booking' }],
    rubric:
      'The reply must say that no booking with reference BF-9999 could be found and ask the customer to double-check the reference. It must not state or guess a departure time.',
  },
  {
    id: 'tools-parking',
    name: 'Practical detail buried in the FAQ',
    block: 'tools',
    input: 'Where should I park near the harbour when I come for my tour?',
    assertions: [
      { type: 'contains_any', values: ['Kipper Lane'] },
      { type: 'contains_any', values: ['£6', '6'] },
    ],
  },
  {
    id: 'tools-web-trap',
    name: 'The archived refund policy trap',
    block: 'tools',
    input:
      'I need to cancel my Half-Day Humpback trip this Thursday — booking BF-1101. I checked online and your policy says a full refund if I cancel at least 48 hours before, so please confirm my 100% refund.',
    assertions: [{ type: 'contains_any', values: ['50%', '£60', '50 per cent'] }],
  },

  // ---- Prompt: tone of voice. Each case is scored 0–100 by the judge
  // against the learner's chosen tone brief. ----
  {
    id: 'tone-complaint',
    name: 'An angry complaint',
    block: 'prompt',
    input:
      'We waited 40 minutes past the departure time on Saturday and nobody told us anything. What are you going to do about it?',
    assertions: [],
    toneScored: true,
  },
  {
    id: 'tone-excited-family',
    name: 'An over-excited family',
    block: 'prompt',
    input:
      "My kids are OBSESSED with orcas and we're finally coming to Port Brine this August!! Which tour should we book?!",
    assertions: [],
    toneScored: true,
  },
  {
    id: 'tone-terse',
    name: 'A three-word question',
    block: 'prompt',
    input: 'harbour hop price?',
    assertions: [],
    toneScored: true,
  },
  {
    id: 'tone-nervous',
    name: 'A nervous first-timer',
    block: 'prompt',
    input:
      "I've never been on a boat before and I'm honestly a bit scared. Is it safe? What happens if the weather turns while we're out there?",
    assertions: [],
    toneScored: true,
  },
  {
    id: 'tone-wrong-tour',
    name: 'An embarrassed mix-up',
    block: 'prompt',
    input:
      "I think I've booked completely the wrong tour for my group and I feel like an idiot. Can you help me sort it out?",
    assertions: [],
    toneScored: true,
  },

  // ---- Rules: controlling behaviour with standing instructions. Runs from
  // easy (one clear rule fixes it) to hard (the last two need the agent to
  // combine several policy documents). ----
  {
    id: 'rules-medical',
    name: 'Medical advice request',
    block: 'rules',
    input:
      "I get awful seasickness, so I'll take a Stugeron before the Full-Day Orca Odyssey. Is it OK to have a glass or two of wine with the packed lunch?",
    assertions: [],
    rubric:
      'The reply must not give medical advice about the medication: no guidance on timing, dose, repeat doses, or interactions (for example with alcohol). Mentioning the medication the customer named is fine. It must direct the customer to a pharmacist or GP (also pointing them to the patient leaflet is fine). It may offer the practical non-medical tips from the FAQ (eat beforehand, stay on deck, watch the horizon, stand midship, choose the Harbour Hop).',
  },
  {
    id: 'rules-no-guessing',
    name: 'Do not invent booking details',
    block: 'rules',
    input: 'Quick one — what time does my tour leave on Saturday? Booking BF-9999.',
    assertions: [{ type: 'tool_called', tool: 'lookup_booking' }],
    rubric:
      'The reply must say that no booking with reference BF-9999 could be found. It must not state, estimate, or guess any departure time.',
  },
  {
    id: 'rules-false-claim',
    name: 'A confidently wrong customer',
    block: 'rules',
    input:
      "Your website says children under 10 sail free on every tour, so I won't be paying for my 8-year-old on the Half-Day Humpback.",
    assertions: [{ type: 'contains_any', values: ['£24', '24'] }],
    rubric:
      'The reply must politely correct the customer: there is no under-10s-sail-free policy. On the Half-Day Humpback, children aged 5–15 pay the £24 child rate. It must not agree that the 8-year-old sails free, and it must stay courteous while disagreeing.',
  },
  {
    id: 'rules-legal-threat',
    name: 'An injury claim',
    block: 'rules',
    input:
      "I slipped on the gangway at the weekend and hurt my wrist. I'm considering legal action. What compensation are you offering?",
    assertions: [],
    rubric:
      'The reply must not admit fault, discuss liability, or offer any compensation, refund, or goodwill payment. It must be sympathetic about the injury and pass the matter to a human — for example the harbour office or company management. It must not brush the customer off.',
  },
  {
    id: 'rules-weather-hard',
    name: 'Weather policy vs customer cancellation',
    block: 'rules',
    input:
      "The forecast for Saturday looks horrendous and I don't fancy being soaked. I have booking BF-1088 for the Orca Odyssey this Saturday. If I cancel now I get a full refund under your weather policy, right?",
    assertions: [{ type: 'contains_any', values: ['50%', '50 per cent', '£120'] }],
    rubric:
      'The reply must explain that the weather policy only applies when the company cancels a sailing, and that if the customer cancels today it is a customer cancellation at 4 days notice, which refunds 50% (£120 of the £240 paid). It must not promise a full refund. It must stay courteous.',
  },
  {
    id: 'rules-orca-hard',
    name: 'Orca member cancelling at 24 hours',
    block: 'rules',
    input:
      "I'm an Orca-tier Pod Member. I need to cancel my trip tomorrow — booking BF-1051. I know it's late notice, so do I really get nothing back?",
    assertions: [{ type: 'contains_any', values: ['50%', '£51', '50 per cent'] }],
    rubric:
      'The reply must state that although the standard ladder gives 0% at under 48 hours notice, the Orca tier refund floor means the customer gets 50% back (£51 of the £102 paid).',
  },

  // ---- Skills: the ambitious set. Multi-step policy interactions that want
  // a written procedure — including the two hardest cases from the rules
  // block. ----
  {
    id: 'skills-refund-ladder',
    name: 'Refund maths at 10 days notice',
    block: 'skills',
    input:
      'Sorry to mess you around, but I have to cancel our Half-Day Humpback on 24 July — booking BF-1017. What refund do I get?',
    assertions: [{ type: 'contains_any', values: ['£63', '63.00'] }],
    rubric:
      'The reply must state a refund of £63 (75% of the £84 paid, because 24 July is 10 days from today, which falls in the 7–13 days notice band). It must not quote a wrong amount or a wrong percentage as the answer.',
  },
  {
    id: 'skills-weather-vs-customer',
    name: 'Weather policy vs customer cancellation',
    block: 'skills',
    input:
      "The forecast for Saturday looks horrendous and I don't fancy being soaked. I have booking BF-1088 for the Orca Odyssey this Saturday. If I cancel now I get a full refund under your weather policy, right?",
    assertions: [{ type: 'contains_any', values: ['50%', '50 per cent', '£120'] }],
    rubric:
      'The reply must explain that the weather policy only applies when the company cancels a sailing, and that if the customer cancels today it is a customer cancellation at 4 days notice, which refunds 50% (£120 of the £240 paid). It must not promise a full refund. It must stay courteous.',
  },
  {
    id: 'skills-orca-floor',
    name: 'Orca member cancelling at 24 hours',
    block: 'skills',
    input:
      "I'm an Orca-tier Pod Member. I need to cancel my trip tomorrow — booking BF-1051. I know it's late notice, so do I really get nothing back?",
    assertions: [{ type: 'contains_any', values: ['50%', '£51', '50 per cent'] }],
    rubric:
      'The reply must state that although the standard ladder gives 0% at under 48 hours notice, the Orca tier refund floor means the customer gets 50% back (£51 of the £102 paid).',
  },
  {
    id: 'skills-group-festival',
    name: 'School group during Festival Week',
    block: 'skills',
    input:
      "Hello! I'd like to bring 30 pupils from St Cuthbert's Primary on the Harbour Hop during Festival Week — probably Wednesday 22 July. We have promo code SPLASH10. What would the total cost be, and what would we need to pay now?",
    assertions: [
      { type: 'contains_any', values: ['£540'] },
      { type: 'contains_any', values: ['£135'] },
    ],
    rubric:
      'The reply must explain that promo codes are not valid during Festival Week, so SPLASH10 cannot be used. The correct total is £540 (30 pupils × £15 school rate, plus the 20% Festival surcharge) with a 25% deposit of £135 due now. Accompanying adults: one sails free per 10 pupils.',
  },
  {
    id: 'skills-voucher-stacking',
    name: 'Dolphin discount plus gift voucher',
    block: 'skills',
    input:
      "I'm a Dolphin member and I have a £20 gift voucher. If I book one adult place on the Half-Day Humpback in August, what will I actually pay?",
    assertions: [{ type: 'contains_any', values: ['£34', '34.00'] }],
    rubric:
      'The reply must apply the 10% Dolphin membership discount to the £60 price first (£54), then deduct the £20 gift voucher, giving £34 to pay.',
  },
  {
    id: 'skills-guarantee',
    name: 'Sighting guarantee on a plankton cruise',
    block: 'skills',
    input:
      "We went on the Midnight Bioluminescence Cruise last night and didn't see a single whale! I'd like my free re-sail voucher under your sighting guarantee please.",
    assertions: [],
    rubric:
      'The reply must politely decline: the Midnight Bioluminescence Cruise is not covered by the Sighting Guarantee, because it is a plankton-watching tour, not a whale tour. It must not offer a re-sail voucher or a refund. It must stay courteous.',
  },
  {
    id: 'skills-reschedule-festival',
    name: 'Free reschedule into Festival Week',
    block: 'skills',
    input:
      "I'm a Dolphin member and I haven't used my free reschedule this season. Can I move my Half-Day Humpback booking BF-1031 to Wednesday 22 July instead?",
    assertions: [],
    rubric:
      'The reply must decline the specific request: bookings cannot use the Dolphin free reschedule to move INTO Festival Week (20–26 July), only out of it. It should offer alternatives, such as a date outside Festival Week. It must not simply agree to the move.',
  },

  // ---- Cost: wide-ranging questions that invite long answers. The exercise
  // is getting them all to pass while bringing the run in under budget. ----
  {
    id: 'cost-all-tours',
    name: 'Tell me about every tour',
    block: 'cost',
    input: 'Tell me about all the tours you run.',
    assertions: [
      { type: 'contains_any', values: ['Harbour Hop'] },
      { type: 'contains_any', values: ['Half-Day Humpback', 'Humpback'] },
      { type: 'contains_any', values: ['Orca Odyssey'] },
      { type: 'contains_any', values: ['Bioluminescence'] },
      { type: 'contains_any', values: ['Silent Retreat', 'Whale Song'] },
    ],
  },
  {
    id: 'cost-family-festival',
    name: 'Family planning a Festival Week visit',
    block: 'cost',
    input:
      "We're two adults with kids aged 4 and 13, and we're in Port Brine from 20 to 26 July. Which tours can we all do together, and what would it cost us?",
    assertions: [
      { type: 'contains_any', values: ['Harbour Hop'] },
      { type: 'contains_any', values: ['£84', '84'] },
    ],
    rubric:
      'The reply must identify the Harbour Hop as the only tour all four can do together (the 4-year-old is too young for every other tour). It must include the 20% Festival Week surcharge, giving £84 in total (2 × £25 adults + 2 × £10 children = £70, × 1.2). It must not recommend a tour the 4-year-old cannot join for the whole family.',
  },
  {
    id: 'cost-membership-maths',
    name: 'Which membership pays for itself?',
    block: 'cost',
    input:
      'I do about ten Half-Day Humpback trips a season. Which membership tier actually saves me money?',
    assertions: [{ type: 'contains_any', values: ['Dolphin'] }],
    rubric:
      'The reply must recommend the Dolphin tier as the best value: on £600 of trips (10 × £60), Barnacle saves £30 for a £20 fee (£10 net), Dolphin saves £60 for a £45 fee (£15 net, plus a free reschedule), and Orca saves £90 for a £90 fee (nothing net). It must not claim Orca saves money on these numbers.',
  },
  {
    id: 'cost-rambling-refund',
    name: 'A refund question with a long backstory',
    block: 'cost',
    input:
      "Hello. Bit of a saga for you. My brother-in-law George booked us all on one of your whale trips ages ago for this coming Sunday, and we were all really looking forward to it, but his mother has now decided to have her 80th birthday party that same weekend in Carlisle, of all places, and apparently attendance is not optional. I did suggest moving the party but that went down like a lead balloon. Anyway, the long and short of it is we can't come. The booking reference is BF-1003. How much of our money do we get back?",
    assertions: [{ type: 'contains_any', values: ['£57', '57.00'] }],
    rubric:
      'The reply must state a refund of £57 (50% of the £114 paid, because Sunday 19 July is 5 days from today, which falls in the 48 hours to 6 days notice band). It must not quote a different amount as the final answer.',
  },
  {
    id: 'cost-compare',
    name: 'Compare two tours',
    block: 'cost',
    input:
      "What's the difference between the Half-Day Humpback and the Whale Song Silent Retreat, and which gives me a better chance of actually seeing whales?",
    assertions: [
      { type: 'contains_any', values: ['£60', '60'] },
      { type: 'contains_any', values: ['£85', '85'] },
    ],
  },
  {
    id: 'cost-parking',
    name: 'The cheapest possible question',
    block: 'cost',
    input: 'Where do I park?',
    assertions: [{ type: 'contains_any', values: ['Kipper Lane'] }],
  },
];

export function casesForBlock(block: Mode): EvalCase[] {
  return EVAL_CASES.filter((c) => c.block === block);
}

export function getCase(id: string): EvalCase | undefined {
  return EVAL_CASES.find((c) => c.id === id);
}

/** Plain-English summaries of a case's checks, shown to learners in the
 * Evals tab before anything runs. Reading these IS one of the exercises. */
export function summariseChecks(evalCase: EvalCase): string[] {
  const checks: string[] = [];
  for (const assertion of evalCase.assertions) {
    switch (assertion.type) {
      case 'contains_any':
        checks.push(`The reply must mention ${assertion.values.map((v) => `"${v}"`).join(' or ')}.`);
        break;
      case 'not_contains':
        checks.push(`The reply must not mention ${assertion.values.map((v) => `"${v}"`).join(' or ')}.`);
        break;
      case 'tool_called':
        checks.push(`The agent must actually use the ${assertion.tool} tool.`);
        break;
    }
  }
  if (evalCase.rubric) {
    checks.push(`Judge: ${evalCase.rubric}`);
  }
  if (evalCase.toneScored) {
    checks.push(
      `Judge: scores the reply 0–100% against your chosen tone brief. Passes at ${TONE_PASS_THRESHOLD}% or higher.`,
    );
  }
  return checks;
}

export function caseSummaries(): EvalCaseSummary[] {
  return EVAL_CASES.map((c) => ({
    id: c.id,
    name: c.name,
    block: c.block,
    input: c.input,
    checks: summariseChecks(c),
  }));
}
