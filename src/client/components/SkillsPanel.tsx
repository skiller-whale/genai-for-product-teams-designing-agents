import { useState } from 'react';
import type { AgentConfig, Skill } from '../../shared/types';

interface Props {
  config: AgentConfig;
  onChange: (config: AgentConfig) => void;
}

const EMPTY_SKILL: Skill = { name: '', description: '', body: '' };

export function SkillsPanel({ config, onChange }: Props) {
  // Index of the skill open in the editor; 'new' for a fresh one; null closed.
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Skill>(EMPTY_SKILL);

  const openEditor = (index: number | 'new') => {
    setEditing(index);
    setDraft(index === 'new' ? EMPTY_SKILL : { ...config.skills[index] });
  };

  const saveDraft = () => {
    if (!draft.name.trim()) return;
    const skill: Skill = {
      name: draft.name.trim().replaceAll(/\s+/g, '_').toLowerCase(),
      description: draft.description.trim(),
      body: draft.body,
    };
    const skills =
      editing === 'new'
        ? [...config.skills, skill]
        : config.skills.map((s, i) => (i === editing ? skill : s));
    onChange({ ...config, skills });
    setEditing(null);
  };

  const removeSkill = (index: number) => {
    onChange({ ...config, skills: config.skills.filter((_, i) => i !== index) });
    setEditing(null);
  };

  return (
    <section className="panel" data-testid="skills-panel">
      <h2>
        Skills <span className="panel-count">{config.skills.length}</span>
      </h2>
      <p className="panel-hint">
        Named procedures the agent can <strong>load when needed</strong>. Only the name and description ride along on every message — the full text costs tokens only when loaded.
      </p>

      <ul className="skills-list">
        {config.skills.map((skill, index) => (
          <li key={skill.name} className="skill-item">
            <button className="skill-open" onClick={() => openEditor(index)}>
              <span className="skill-name">{skill.name}</span>
              <span className="skill-description">{skill.description || 'No description — the agent may never load it!'}</span>
            </button>
          </li>
        ))}
      </ul>

      {editing === null ? (
        <button className="btn-add" onClick={() => openEditor('new')}>
          New skill
        </button>
      ) : (
        <div className="skill-editor">
          <label>
            Name
            <input
              type="text"
              placeholder="e.g. refund_calculations"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Description <span className="label-hint">(how the agent decides whether to load it)</span>
            <input
              type="text"
              placeholder="e.g. How to work out the refund for any cancellation."
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label>
            Instructions <span className="label-hint">(what the agent reads once loaded)</span>
            <textarea
              rows={8}
              placeholder={'e.g.\n1. Look up the booking to find the amount paid and the date.\n2. Work out the days of notice from today...'}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </label>
          <div className="skill-editor-buttons">
            <button className="btn-add" onClick={saveDraft} disabled={!draft.name.trim()}>
              Save skill
            </button>
            <button onClick={() => setEditing(null)}>Cancel</button>
            {editing !== 'new' && (
              <button className="btn-remove-text" onClick={() => removeSkill(editing)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
