import { describeError } from '../api/client';
import { useStats } from '../api/hooks';
import { BarPanel, type BarDatum } from '../components/BarPanel';
import { DEFENSE_LABELS, TECHNIQUE_LABELS } from '../labels';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const count = (v: number) => v.toLocaleString();

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Stats() {
  const { overview, techniques, defenses } = useStats();
  const error = overview.error ?? techniques.error ?? defenses.error;
  if (error) return <p className="text-red-400">{describeError(error)}</p>;
  if (!overview.data || !techniques.data || !defenses.data) return <p className="text-slate-500">Loading…</p>;

  const o = overview.data;
  const leakByTechnique: BarDatum[] = techniques.data
    .filter((t) => t.attempts > 0)
    .sort((a, b) => b.leakRate - a.leakRate || b.attempts - a.attempts)
    .map((t) => ({ label: TECHNIQUE_LABELS[t.technique] ?? t.technique, value: t.leakRate, detail: `${t.leaks} of ${t.attempts} attempts` }));
  const perLevel: BarDatum[] = o.levels.map((l) => ({
    label: `L${l.level}`,
    value: l.attempts,
    detail: `${l.clears} cleared · ${pct(l.leakRate)} leaked`,
  }));
  const byDefense: BarDatum[] = [...defenses.data]
    .sort((a, b) => b.blocked - a.blocked)
    .map((d) => ({ label: DEFENSE_LABELS[d.defense], value: d.blocked, detail: `${pct(o.attempts ? d.blocked / o.attempts : 0)} of all attempts` }));
  const anyBlocked = byDefense.some((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">What works against which defense</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every attempt is labelled with attack techniques by a classifier (multi-label, so one attempt can count for several).
          A leak means the secret appeared in the reply or in an email that actually went out.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Attempts" value={count(o.attempts)} />
        <Tile label="Players" value={count(o.players)} />
        <Tile label="Leaks" value={count(o.leaks)} />
        <Tile label="Leak rate" value={pct(o.attempts ? o.leaks / o.attempts : 0)} hint="leaks ÷ attempts" />
      </div>
      <BarPanel
        title="Leak rate by technique"
        subtitle="Share of attempts using each technique that leaked the secret"
        data={leakByTechnique}
        format={pct}
        horizontal
        valueHeader="Leak rate"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <BarPanel title="Attempts per level" subtitle="All attempts, labelled or not" data={perLevel} format={count} valueHeader="Attempts" />
        <BarPanel
          title="Which defense blocked most"
          subtitle="Times each defense stopped an attempt"
          data={anyBlocked ? byDefense : []}
          format={count}
          horizontal
          integer
          valueHeader="Blocked"
        />
      </div>
    </div>
  );
}
