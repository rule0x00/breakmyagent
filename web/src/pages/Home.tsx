import { Link } from 'react-router';
import { describeError } from '../api/client';
import { useLevels, useToken } from '../api/hooks';
import type { LevelSummary } from '../api/types';
import { NicknameForm } from '../components/NicknameForm';

function LevelCard({ level }: { level: LevelSummary }) {
  const status = level.cleared ? '✅ Cleared' : level.unlocked ? '▶ Open' : '🔒 Locked';
  const body = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-slate-500">LEVEL {level.level}</span>
        <span className="text-xs text-slate-400">{status}</span>
      </div>
      <h3 className="mt-1 text-lg font-semibold">{level.name}</h3>
      <p className="mt-1 text-sm text-slate-400">{level.defense}</p>
    </>
  );
  if (!level.unlocked) {
    return <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 opacity-50">{body}</div>;
  }
  return (
    <Link
      to={`/levels/${level.level}`}
      className={`block rounded-xl border bg-slate-900 p-4 transition hover:border-emerald-500/60 ${
        level.cleared ? 'border-emerald-500/30' : 'border-slate-700'
      }`}
    >
      {body}
    </Link>
  );
}

export function Home() {
  const token = useToken();
  const levels = useLevels();

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-bold sm:text-4xl">Can you trick an AI agent into leaking its secret?</h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Five levels, from a naive chatbot to a tool-using email agent. Each agent guards a secret made just for you. Get
          it to slip, then submit the secret to unlock the next level. Every level adds a stronger defense.
        </p>
      </section>

      <p className="rounded-lg border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-200">
        Heads up: your attempts are stored and used for anonymous statistics about which attack techniques work. Don't paste
        personal data.
      </p>

      {!token && <NicknameForm />}

      {token && (
        <section>
          <h2 className="mb-3 text-xl font-semibold">Levels</h2>
          {levels.isPending && <p className="text-slate-500">Loading…</p>}
          {levels.isError && <p className="text-red-400">{describeError(levels.error)}</p>}
          {levels.data && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {levels.data.map((l) => (
                <LevelCard key={l.level} level={l} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
