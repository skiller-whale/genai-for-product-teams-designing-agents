import type { AgentConfig, Mode, ToneBrief, ToolInfo } from '../../shared/types';
import { modeInfo } from '../../shared/types';
import { RulesPanel } from './RulesPanel';
import { SkillsPanel } from './SkillsPanel';
import { ToolsPanel } from './ToolsPanel';

interface Props {
  mode: Mode;
  config: AgentConfig;
  tools: ToolInfo[];
  toneBriefs: ToneBrief[];
  onChange: (config: AgentConfig) => void;
  onReset: () => void;
}

/** The left half of the workbench: everything that makes the agent what it
 * is. Which sections appear depends on the mode — locked areas are hidden,
 * not greyed out, so early modes stay uncluttered. In Investigation mode the
 * whole pane is a read-only view of the preset agent. */
export function DesignPane({ mode, config, tools, toneBriefs, onChange, onReset }: Props) {
  const editable = modeInfo(mode).editable;
  const investigation = mode === 'investigation';

  return (
    <aside className="design-pane" data-testid="design-pane">
      <div className="design-pane-header">
        <h2>Agent design</h2>
        {investigation && (
          <p className="design-readonly-note" data-testid="design-readonly-note">
            This agent came pre-built for the investigation — you can read its design, but not
            change it. From the next exercise you'll build your own, from scratch.
          </p>
        )}
      </div>

      {(investigation || editable.includes('systemPrompt')) &&
        (investigation ? (
          <ReadOnlySystemPrompt config={config} />
        ) : (
          <SystemPromptPanel config={config} toneBriefs={toneBriefs} onChange={onChange} />
        ))}

      {(investigation || editable.includes('rules')) &&
        (investigation ? (
          <ReadOnlyRules config={config} />
        ) : (
          <RulesPanel config={config} onChange={onChange} />
        ))}

      {(investigation || editable.includes('skills')) &&
        (investigation ? (
          <ReadOnlySkills config={config} />
        ) : (
          <SkillsPanel config={config} onChange={onChange} />
        ))}

      {(investigation || editable.includes('tools')) &&
        (investigation ? (
          <ReadOnlyTools config={config} tools={tools} />
        ) : (
          <ToolsPanel config={config} tools={tools} onChange={onChange} />
        ))}

      {!investigation && (
        <div className="design-pane-footer">
          <button className="btn-reset" onClick={onReset}>
            Reset my agent
          </button>
        </div>
      )}
    </aside>
  );
}

function SystemPromptPanel({
  config,
  toneBriefs,
  onChange,
}: {
  config: AgentConfig;
  toneBriefs: ToneBrief[];
  onChange: (config: AgentConfig) => void;
}) {
  return (
    <section className="panel" data-testid="system-prompt-panel">
      <h2>System prompt</h2>
      <p className="panel-hint">
        The agent's standing orders, read before <strong>every</strong> message. Who it is, how it
        behaves — and how it sounds.
      </p>
      <textarea
        className="system-prompt-editor"
        value={config.systemPrompt}
        rows={9}
        onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
        aria-label="System prompt"
      />
      <p className="system-prompt-fixed" title="Added by the Workbench so results are repeatable. Not editable.">
        📌 Always added for you: <em>Today's date is Tuesday 14 July 2026.</em>
      </p>

      <div className="tone-picker" data-testid="tone-picker">
        <h3>Tone brief</h3>
        <p className="panel-hint">
          The tone evals score Finn's replies against the brief you pick here.
        </p>
        {toneBriefs.map((brief) => (
          <label
            key={brief.id}
            className={`tone-option ${config.toneBrief === brief.id ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="tone-brief"
              checked={config.toneBrief === brief.id}
              onChange={() => onChange({ ...config, toneBrief: brief.id })}
            />
            <span className="tone-option-text">
              <span className="tone-option-name">{brief.name}</span>
              <span className="tone-option-brief">{brief.brief}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function ReadOnlySystemPrompt({ config }: { config: AgentConfig }) {
  return (
    <section className="panel readonly" data-testid="system-prompt-panel">
      <h2>System prompt</h2>
      <p className="panel-hint">
        The agent's standing orders, read before <strong>every</strong> message.
      </p>
      <pre className="readonly-block">{config.systemPrompt}</pre>
      <p className="system-prompt-fixed">
        📌 Always added: <em>Today's date is Tuesday 14 July 2026.</em>
      </p>
    </section>
  );
}

function ReadOnlyRules({ config }: { config: AgentConfig }) {
  return (
    <section className="panel readonly" data-testid="rules-panel">
      <h2>
        Rules <span className="panel-count">{config.rules.length}</span>
      </h2>
      <p className="panel-hint">
        Plain-English instructions the agent reads on <strong>every</strong> message.
      </p>
      <ul className="readonly-rules">
        {config.rules.map((rule, index) => (
          <li key={index}>{rule}</li>
        ))}
      </ul>
    </section>
  );
}

function ReadOnlySkills({ config }: { config: AgentConfig }) {
  return (
    <section className="panel readonly" data-testid="skills-panel">
      <h2>
        Skills <span className="panel-count">{config.skills.length}</span>
      </h2>
      <p className="panel-hint">
        Named procedures the agent can <strong>load when needed</strong>. Only the name and
        description ride along on every message.
      </p>
      {config.skills.map((skill) => (
        <details key={skill.name} className="readonly-skill">
          <summary>
            <span className="skill-name">{skill.name}</span>
            <span className="skill-description">{skill.description}</span>
          </summary>
          <pre className="readonly-block">{skill.body}</pre>
        </details>
      ))}
    </section>
  );
}

function ReadOnlyTools({ config, tools }: { config: AgentConfig; tools: ToolInfo[] }) {
  return (
    <section className="panel readonly" data-testid="tools-panel">
      <h2>
        Tools <span className="panel-count">{config.enabledTools.length}</span>
      </h2>
      <p className="panel-hint">
        Things the agent can <strong>do</strong>, not just say.
      </p>
      <ul className="tools-list">
        {tools.map((tool) => {
          const enabled = tool.alwaysOn || config.enabledTools.includes(tool.id);
          return (
            <li key={tool.id} className={`tool-item ${enabled ? 'enabled' : ''}`}>
              <span className="tool-readonly-state">{enabled ? '●' : '○'}</span>
              <span className="tool-text">
                <span className="tool-name">
                  {tool.name}
                  {tool.alwaysOn && <span className="tool-builtin"> (built-in)</span>}
                </span>
                <span className="tool-description">{tool.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
