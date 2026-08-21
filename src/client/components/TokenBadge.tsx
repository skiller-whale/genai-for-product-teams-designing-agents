import type { TokenUsage } from '../../shared/types';
import { costUsd, formatCost, formatTokens } from '../../shared/pricing';

export function TokenBadge({ usage, label }: { usage: TokenUsage; label?: string }) {
  const total = usage.inputTokens + usage.outputTokens;
  if (total === 0) return null;
  return (
    <span
      className="token-badge"
      title={`${formatTokens(usage.inputTokens)} tokens in, ${formatTokens(usage.outputTokens)} tokens out`}
    >
      {label ? `${label}: ` : ''}
      {formatTokens(total)} tokens · ~{formatCost(costUsd(usage))}
    </span>
  );
}
