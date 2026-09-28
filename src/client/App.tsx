import { useCallback, useEffect, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import type { AgentConfig, Mode, ToneBrief, ToolInfo } from '../shared/types';
import { MODES } from '../shared/types';
import * as api from './api';
import { WATCHING, useMirroredState, useWatchStatus } from './mirror';
import { DesignPane } from './components/DesignPane';
import { ChatPane } from './components/ChatPane';
import { EvalsPane } from './components/EvalsPane';

export default function App() {
  const [mode, setMode] = useMirroredState('mode', 'investigation');
  const [config, setConfig] = useMirroredState('config', null as AgentConfig | null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [toneBriefs, setToneBriefs] = useState<ToneBrief[]>([]);
  const [simulatedDate, setSimulatedDate] = useState('');
  const [tab, setTab] = useMirroredState('tab', 'chat');
  const [error, setError] = useMirroredState('error', null as string | null);

  const applyConfigResponse = useCallback((response: api.ConfigResponse) => {
    setMode(response.mode);
    setConfig(response.config);
    setTools(response.tools);
    setToneBriefs(response.toneBriefs);
    setSimulatedDate(response.simulatedDate);
  }, []);

  useEffect(() => {
    api.getConfig().then(applyConfigResponse).catch((err) => setError(err.message));
  }, [applyConfigResponse]);

  // Every edit saves the whole config: simple, and losing a keystroke race
  // doesn't matter with a single learner per VM.
  const updateConfig = useCallback((next: AgentConfig) => {
    setConfig(next);
    api.putConfig(next).catch((err) => setError(err.message));
  }, []);

  const changeMode = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      api.putMode(next).then(applyConfigResponse).catch((err) => setError(err.message));
    },
    [mode, applyConfigResponse],
  );

  const handleReset = useCallback(() => {
    if (!window.confirm('Reset your agent to a blank slate? Your system prompt, skills and tool choices will be lost. Eval history is kept.')) {
      return;
    }
    api.resetConfig().then(applyConfigResponse).catch((err) => setError(err.message));
  }, [applyConfigResponse]);

  if (error && !config) {
    return (
      <div className="app-error">
        <h1>Something went wrong</h1>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  if (!config) {
    return <div className="app-loading">Loading the workbench…</div>;
  }

  return (
    <div className="app" {...(WATCHING ? READ_ONLY_HANDLERS : {})}>
      {WATCHING && <WatchBanner />}
      <header className="app-header">
        <div className="app-title">
          <h1>🐋 Agent Workbench</h1>
          <span className="app-subtitle">The Barnacle &amp; Fluke Whale-Watching Company</span>
        </div>
        <nav className="mode-slider" aria-label="Exercise mode" data-testid="mode-slider">
          {MODES.map((m, index) => (
            <button
              key={m.id}
              className={`mode-step ${m.id === mode ? 'active' : ''}`}
              onClick={() => changeMode(m.id)}
              title={`Switch to ${m.label} mode`}
            >
              <span className="mode-step-number">{index + 1}</span>
              <span className="mode-step-label">{m.label}</span>
            </button>
          ))}
        </nav>
        <div className="app-header-right">
          <span className="sim-date" title="The agent's date is fixed, so results repeat.">
            📅 {simulatedDate}
          </span>
        </div>
      </header>

      {error && (
        <div className="app-banner-error" role="alert">
          ⚠️ {error} <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="app-body">
        <DesignPane
          mode={mode}
          config={config}
          tools={tools}
          toneBriefs={toneBriefs}
          onChange={updateConfig}
          onReset={handleReset}
        />

        <main className="main">
          <nav className="tabs">
            <button className={tab === 'chat' ? 'tab active' : 'tab'} onClick={() => setTab('chat')}>
              💬 Chat with Finn
            </button>
            <button className={tab === 'evals' ? 'tab active' : 'tab'} onClick={() => setTab('evals')}>
              📊 Evals
            </button>
          </nav>
          <div className="tab-content" style={{ display: tab === 'chat' ? 'contents' : 'none' }}>
            <ChatPane />
          </div>
          <div className="tab-content" style={{ display: tab === 'evals' ? 'contents' : 'none' }}>
            <EvalsPane active={tab === 'evals'} mode={mode} />
          </div>
        </main>
      </div>
    </div>
  );
}

/** On /watch, swallow anything that would change the learner's Workbench:
 * clicks, typing, pasting, dropping. Opening a collapsed tool call or skill
 * (a <summary>) is still allowed, since that only changes the coach's page. */
function block(e: SyntheticEvent) {
  if (e.target instanceof Element && e.target.closest('summary')) return;
  e.preventDefault();
  e.stopPropagation();
}

const READ_ONLY_HANDLERS = {
  // Blocking mousedown also stops the coach's clicks focusing the learner's fields.
  onMouseDownCapture: block,
  onClickCapture: block,
  onKeyDownCapture: (e: KeyboardEvent) => {
    // Keep keys that only scroll the page; block the rest.
    if (/^(Arrow|Page|Home|End)/.test(e.key) && !(e.target instanceof HTMLTextAreaElement)) return;
    block(e);
  },
  onBeforeInputCapture: block,
  onPasteCapture: block,
  onCutCapture: block,
  onDropCapture: block,
  onSubmitCapture: block,
};

function WatchBanner() {
  const status = useWatchStatus();
  const text = {
    connecting: 'Connecting to the learner\'s Workbench…',
    waiting: 'Waiting for the learner to open the Workbench. Until then this shows the saved agent.',
    following: 'Following the learner live. Read-only: you see what they see, and nothing you do changes it.',
  }[status];
  return (
    <div className={`watch-banner ${status}`} role="status" data-testid="watch-banner">
      👀 {text}
    </div>
  );
}
