import type { LearnerView, LearnerViewKey } from '../../shared/types';

// The learner's on-screen state, as their browser last published it. Held in
// memory only: if the server restarts, the learner's page has to reload
// anyway, and it republishes everything as it mounts.

type Listener = (key: LearnerViewKey, value: unknown) => void;

let view: LearnerView = {};
const listeners = new Set<Listener>();

export function getView(): LearnerView {
  return view;
}

export function setViewKey(key: LearnerViewKey, value: unknown): void {
  view = { ...view, [key]: value };
  for (const listener of listeners) listener(key, value);
}

/** Call `listener` on every published key; returns the unsubscribe function. */
export function onViewChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests. */
export function resetView(): void {
  view = {};
}
