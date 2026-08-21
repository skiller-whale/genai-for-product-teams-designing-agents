import type { AgentConfig, ToolInfo } from '../../shared/types';

interface Props {
  config: AgentConfig;
  tools: ToolInfo[];
  onChange: (config: AgentConfig) => void;
}

export function ToolsPanel({ config, tools, onChange }: Props) {
  const toggle = (id: string) => {
    const enabled = config.enabledTools.includes(id)
      ? config.enabledTools.filter((t) => t !== id)
      : [...config.enabledTools, id];
    onChange({ ...config, enabledTools: enabled });
  };

  const enabledCount = config.enabledTools.length;

  return (
    <section className="panel" data-testid="tools-panel">
      <h2>
        Tools <span className="panel-count">{enabledCount}</span>
      </h2>
      <p className="panel-hint">
        Things the agent can <strong>do</strong>, not just say. Each tool changes what the agent can reach — for better or worse.
      </p>
      <ul className="tools-list">
        {tools.map((tool) => {
          const checked = tool.alwaysOn || config.enabledTools.includes(tool.id);
          return (
            <li key={tool.id} className={`tool-item ${checked ? 'enabled' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={tool.alwaysOn}
                  onChange={() => toggle(tool.id)}
                />
                <span className="tool-text">
                  <span className="tool-name">
                    {tool.name}
                    {tool.alwaysOn && <span className="tool-builtin"> (built-in)</span>}
                  </span>
                  <span className="tool-description">{tool.description}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
