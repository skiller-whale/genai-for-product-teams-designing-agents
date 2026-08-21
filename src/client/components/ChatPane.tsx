import { useRef, useState } from 'react';
import type { TokenUsage, TranscriptStep } from '../../shared/types';
import { EMPTY_USAGE, addUsage } from '../../shared/types';
import * as api from '../api';
import { StepList } from './StepList';
import { TokenBadge } from './TokenBadge';

interface UserTurn {
  role: 'user';
  text: string;
}

interface AgentTurn {
  role: 'agent';
  steps: TranscriptStep[];
  usage: TokenUsage;
  running: boolean;
  error?: string;
}

type Turn = UserTurn | AgentTurn;

const SUGGESTIONS = [
  'How long is the Full-Day Orca Odyssey, and how much does it cost?',
  'I need to cancel booking BF-1017. How much will I get back?',
  'Do you allow dogs on board?',
];

function finalTextOf(turn: AgentTurn): string {
  return turn.steps
    .filter((s): s is Extract<TranscriptStep, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.text)
    .join('\n\n');
}

export function ChatPane() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  const clearChat = () => {
    setTurns([]);
    inputRef.current?.focus();
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setDraft('');
    // The box stays enabled and focused, so following up is just typing.
    inputRef.current?.focus();

    // Prior turns as plain text — the server does not replay old tool calls.
    const history = turns.map((turn) =>
      turn.role === 'user'
        ? { role: 'user' as const, text: turn.text }
        : { role: 'assistant' as const, text: finalTextOf(turn) },
    );

    const agentTurn: AgentTurn = { role: 'agent', steps: [], usage: EMPTY_USAGE, running: true };
    setTurns((t) => [...t, { role: 'user', text: message }, agentTurn]);
    scrollDown();

    const patchAgent = (patch: (turn: AgentTurn) => AgentTurn) => {
      setTurns((t) => {
        const next = [...t];
        const last = next[next.length - 1];
        if (last?.role === 'agent') next[next.length - 1] = patch(last);
        return next;
      });
      scrollDown();
    };

    try {
      await api.streamChat(message, history, (event) => {
        switch (event.type) {
          case 'assistant_text':
            patchAgent((turn) => ({
              ...turn,
              steps: [...turn.steps, { kind: 'text', text: event.text }],
            }));
            break;
          case 'tool_call':
            patchAgent((turn) => ({
              ...turn,
              steps: [
                ...turn.steps,
                { kind: 'tool_call', tool: event.tool, input: event.input, result: '' },
              ],
            }));
            break;
          case 'tool_result':
            patchAgent((turn) => {
              const steps = [...turn.steps];
              for (let i = steps.length - 1; i >= 0; i--) {
                const step = steps[i];
                if (step.kind === 'tool_call' && step.tool === event.tool && step.result === '') {
                  steps[i] = { ...step, result: event.result, isError: event.isError };
                  break;
                }
              }
              return { ...turn, steps };
            });
            break;
          case 'usage':
            patchAgent((turn) => ({ ...turn, usage: addUsage(turn.usage, event.usage) }));
            break;
          case 'error':
            patchAgent((turn) => ({ ...turn, error: event.message, running: false }));
            break;
          case 'done':
            patchAgent((turn) => ({ ...turn, running: false }));
            break;
        }
      });
    } catch (err) {
      patchAgent((turn) => ({
        ...turn,
        error: err instanceof Error ? err.message : String(err),
        running: false,
      }));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="chat-pane"
      onKeyDown={(e) => {
        // Esc anywhere in the chat pane starts a fresh conversation.
        if (e.key === 'Escape' && !busy && turns.length > 0) {
          e.preventDefault();
          clearChat();
        }
      }}
    >
      <div className="chat-toolbar">
        <span className="chat-toolbar-hint">
          You are talking to Finn as a customer would. Each conversation is separate — clear it to
          start again.
        </span>
        <button
          className="btn-clear-chat"
          onClick={clearChat}
          disabled={busy || turns.length === 0}
          title="Start a fresh conversation (Esc)"
        >
          🧹 Clear chat <kbd>Esc</kbd>
        </button>
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>Send Finn a customer message and watch how it handles it — every tool call is shown as a step.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) =>
          turn.role === 'user' ? (
            <div key={index} className="chat-turn user">
              <div className="chat-bubble user">{turn.text}</div>
            </div>
          ) : (
            <div key={index} className="chat-turn agent">
              <div className="chat-bubble agent">
                <StepList steps={turn.steps} />
                {turn.running && <div className="chat-thinking">Finn is working…</div>}
                {turn.error && <div className="chat-error">⚠️ {turn.error}</div>}
              </div>
              {!turn.running && <TokenBadge usage={turn.usage} label="this reply" />}
            </div>
          ),
        )}
      </div>
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          placeholder="Write a customer message…"
          value={draft}
          rows={2}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <div className="chat-input-buttons">
          <button className="btn-send" onClick={() => send(draft)} disabled={busy || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
