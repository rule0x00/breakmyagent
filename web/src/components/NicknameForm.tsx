import { useState, type FormEvent } from 'react';
import { describeError } from '../api/client';
import { useCreateGuest } from '../api/hooks';

const NICK_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function NicknameForm() {
  const [nickname, setNickname] = useState('');
  const create = useCreateGuest();
  const valid = NICK_RE.test(nickname);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (valid) create.mutate(nickname);
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <label htmlFor="nickname" className="block text-sm font-medium">
        Pick a nickname to start
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. prompt_ninja"
          maxLength={20}
          autoComplete="off"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={!valid || create.isPending}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {create.isPending ? 'Starting…' : 'Play'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">3–20 characters: letters, digits, underscore. Shown on the leaderboard.</p>
      {create.isError && <p className="mt-2 text-sm text-red-400">{describeError(create.error)}</p>}
    </form>
  );
}
