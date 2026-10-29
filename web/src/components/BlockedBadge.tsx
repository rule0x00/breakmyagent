import type { BlockedBy } from '../api/types';

const LABELS: Record<BlockedBy, string> = {
  input_guard: '🚫 Input guard',
  output_filter: '🛡️ Output filter',
  egress_filter: '📮 Egress filter',
};

export function BlockedBadge({ by }: { by: BlockedBy }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
      Blocked by {LABELS[by]}
    </span>
  );
}
