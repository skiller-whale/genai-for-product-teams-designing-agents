import type { TranscriptStep } from '../../shared/types';

// Renders the visible steps of an agent run: what it said, what tools it
// called, and what came back. Seeing the steps is half the point of the
// session — the loop stops being magic once you can watch it think.

function toolEmoji(tool: string): string {
  switch (tool) {
    case 'search_knowledge_base':
      return '🔎';
    case 'read_document':
      return '📄';
    case 'lookup_booking':
      return '🎫';
    case 'calculator':
      return '🧮';
    case 'search_the_web':
      return '🌐';
    case 'load_skill':
      return '🧠';
    default:
      return '🔧';
  }
}

function summariseInput(input: Record<string, unknown>): string {
  return Object.values(input)
    .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join(', ');
}

export function StepList({ steps }: { steps: TranscriptStep[] }) {
  return (
    <div className="step-list">
      {steps.map((step, index) =>
        step.kind === 'text' ? (
          <div key={index} className="step-text">
            {step.text}
          </div>
        ) : (
          <details key={index} className={`step-tool ${step.isError ? 'tool-error' : ''}`}>
            <summary>
              <span className="step-tool-emoji">{toolEmoji(step.tool)}</span>
              <span className="step-tool-name">
                {step.tool === 'load_skill' ? 'loaded skill' : step.tool}
              </span>
              <span className="step-tool-input">{summariseInput(step.input)}</span>
              {step.isError && <span className="step-tool-errorflag">error</span>}
            </summary>
            <pre className="step-tool-result">{step.result || '…'}</pre>
          </details>
        ),
      )}
    </div>
  );
}
