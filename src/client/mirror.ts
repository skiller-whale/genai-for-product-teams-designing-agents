import {
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { LearnerView, LearnerViewKey } from '../shared/types';

// Follow mode for coaches. The learner's page publishes each piece of state
// it shows (mode, tab, chat, eval progress, …) to the server as it changes.
// The coach opens the same app at /watch, which renders from the learner's
// published state instead of its own, and ignores every click and keystroke.

/** True on the coach's read-only follow page. */
export const WATCHING = /^\/watch\/?$/.test(window.location.pathname);

// ---- Learner side: publish each key shortly after it changes ----

/** Typing changes state on every keystroke; the coach needs a steady view, not every keystroke. */
const PUBLISH_DELAY_MS = 250;
const timers = new Map<LearnerViewKey, ReturnType<typeof setTimeout>>();

function publish(key: LearnerViewKey, value: unknown): void {
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fetch('/api/view', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }).catch(() => {
        // Following is a nice-to-have: never trouble the learner with it.
      });
    }, PUBLISH_DELAY_MS),
  );
}

// ---- Coach side: the learner's view, streamed from the server ----

type ViewValue<K extends LearnerViewKey> = Exclude<LearnerView[K], undefined>;

export type WatchStatus = 'connecting' | 'waiting' | 'following';

let mirrored: LearnerView = {};
let status: WatchStatus = 'connecting';
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

if (WATCHING) {
  // EventSource reconnects by itself if the connection drops, and the server
  // sends a full snapshot on every connect.
  const events = new EventSource('/api/view/events');
  events.addEventListener('snapshot', (e) => {
    mirrored = JSON.parse((e as MessageEvent).data);
    status = Object.keys(mirrored).length > 0 ? 'following' : 'waiting';
    notify();
  });
  events.addEventListener('key', (e) => {
    const { key, value } = JSON.parse((e as MessageEvent).data);
    mirrored = { ...mirrored, [key]: value };
    status = 'following';
    notify();
  });
  events.addEventListener('error', () => {
    status = 'connecting';
    notify();
  });
}

export function useWatchStatus(): WatchStatus {
  return useSyncExternalStore(subscribe, () => status);
}

/** useState whose value the coach sees too. On the learner's page it is
 * plain useState that also publishes. On /watch it returns the learner's
 * value once one has arrived; until then (or for a key the learner's page
 * never sent) it falls back to the local state, so the coach's page still
 * shows the server's config and eval history on its own. */
export function useMirroredState<K extends LearnerViewKey>(
  key: K,
  initial: ViewValue<K> | (() => ViewValue<K>),
): [ViewValue<K>, Dispatch<SetStateAction<ViewValue<K>>>] {
  const [local, setLocal] = useState(initial);
  const remote = useSyncExternalStore(subscribe, () => mirrored);

  useEffect(() => {
    if (!WATCHING) publish(key, local);
  }, [key, local]);

  if (WATCHING && key in remote) return [remote[key] as ViewValue<K>, setLocal];
  return [local, setLocal];
}
