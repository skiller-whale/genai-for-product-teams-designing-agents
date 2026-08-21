import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import bookingsData from './bookings.json';

// The fixed "today" for the whole scenario. Injected into the system prompt so
// notice-period arithmetic (refund ladders, Festival Week) is deterministic —
// evals would flake if the agent used the real clock.
export const SIMULATED_DATE = 'Tuesday 14 July 2026';

/** The minimal starting system prompt every learner begins with. Deliberately
 * thin: everything else about the agent's behaviour is theirs to design. The
 * simulated-date line is NOT part of this — the server appends it to every
 * prompt (see buildSystemPrompt), because the evals depend on it. */
export const BASE_PERSONA = [
  'You are Finn, the customer-support assistant for The Barnacle & Fluke Whale-Watching Company, a whale-watching tour operator in the harbour town of Port Brine.',
  'You answer customer messages on the company website.',
].join('\n');

/** Appended by the server to every system prompt, editable by nobody. */
export const DATE_LINE = `Today's date is ${SIMULATED_DATE}. Treat this as the current date in every calculation.`;

export interface KbDoc {
  id: string;
  title: string;
  content: string;
}

export interface Booking {
  reference: string;
  customer: string;
  tour: string;
  date: string;
  departureTime: string;
  adults: number;
  children: number;
  amountPaidGbp: number;
  membershipTier: 'none' | 'barnacle' | 'dolphin' | 'orca';
  status: 'confirmed' | 'sailed' | 'cancelled' | 'deposit_paid';
}

const KB_DIR = join(import.meta.dir, 'kb');

function loadKbDocs(): KbDoc[] {
  return readdirSync(KB_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((filename) => {
      const content = readFileSync(join(KB_DIR, filename), 'utf-8');
      const title = content.match(/^# (.+)$/m)?.[1] ?? filename;
      return { id: filename.replace(/\.md$/, ''), title, content };
    });
}

export const KB_DOCS: KbDoc[] = loadKbDocs();

export const BOOKINGS: Booking[] = bookingsData as Booking[];

export function getBooking(reference: string): Booking | undefined {
  return BOOKINGS.find(
    (b) => b.reference.toLowerCase() === reference.trim().toLowerCase(),
  );
}
