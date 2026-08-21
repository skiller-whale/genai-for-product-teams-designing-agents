import { useState } from 'react';
import type { AgentConfig } from '../../shared/types';

interface Props {
  config: AgentConfig;
  onChange: (config: AgentConfig) => void;
}

export function RulesPanel({ config, onChange }: Props) {
  const [draft, setDraft] = useState('');

  const addRule = () => {
    const rule = draft.trim();
    if (!rule) return;
    onChange({ ...config, rules: [...config.rules, rule] });
    setDraft('');
  };

  const updateRule = (index: number, text: string) => {
    const rules = [...config.rules];
    rules[index] = text;
    onChange({ ...config, rules });
  };

  const removeRule = (index: number) => {
    onChange({ ...config, rules: config.rules.filter((_, i) => i !== index) });
  };

  return (
    <section className="panel" data-testid="rules-panel">
      <h2>
        Rules <span className="panel-count">{config.rules.length}</span>
      </h2>
      <p className="panel-hint">
        Plain-English instructions the agent reads on <strong>every</strong> message. Always obeyed, always costing tokens.
      </p>
      <ul className="rules-list">
        {config.rules.map((rule, index) => (
          <li key={index} className="rule-item">
            <textarea
              value={rule}
              rows={2}
              onChange={(e) => updateRule(index, e.target.value)}
              aria-label={`Rule ${index + 1}`}
            />
            <button
              className="btn-remove"
              title="Delete this rule"
              onClick={() => removeRule(index)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="panel-add">
        <textarea
          placeholder="e.g. Only state policies you have found in the knowledge base."
          value={draft}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              addRule();
            }
          }}
        />
        <button className="btn-add" onClick={addRule} disabled={!draft.trim()}>
          Add rule
        </button>
      </div>
    </section>
  );
}
