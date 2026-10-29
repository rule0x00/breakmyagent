import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { describeError } from '../api/client';
import { useSubmitSecret } from '../api/hooks';

const LAST_LEVEL = 5;

export function SubmitSecret({ level, alreadyCleared }: { level: number; alreadyCleared: boolean }) {
  const [secret, setSecret] = useState('');
  const submit = useSubmitSecret(level);
  const result = submit.data;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (secret.trim()) submit.mutate(secret.trim());
  }

  if (result?.correct || alreadyCleared) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
        <p className="font-semibold text-emerald-300">🎉 Level {level} cleared</p>
        {result?.correct && (
          <p className="mt-1 text-sm text-emerald-200/80">
            Took you {result.attemptsUsed} attempt{result.attemptsUsed === 1 ? '' : 's'}.
          </p>
        )}
        {level < LAST_LEVEL ? (
          <Link
            to={`/levels/${level + 1}`}
            className="mt-3 inline-block rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Next level →
          </Link>
        ) : (
          <p className="mt-2 text-sm text-emerald-200/80">That was the last level. Respect.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <label htmlFor="secret" className="text-sm font-medium">
        Got the secret?
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="WORD-1234"
          maxLength={100}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-sm uppercase outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={!secret.trim() || submit.isPending}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-white disabled:opacity-40"
        >
          Submit
        </button>
      </div>
      {result && !result.correct && <p className="mt-2 text-sm text-red-400">Not quite. Keep digging.</p>}
      {submit.isError && <p className="mt-2 text-sm text-red-400">{describeError(submit.error)}</p>}
    </form>
  );
}
