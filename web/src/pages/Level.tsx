import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { ApiError, describeError } from '../api/client';
import { useAttempt, useLevel, useResetHistory, useToken } from '../api/hooks';
import type { LevelDetail } from '../api/types';
import { Chat, type ChatEntry } from '../components/Chat';
import { SubmitSecret } from '../components/SubmitSecret';

let nextId = 0;
const newId = () => `m${++nextId}`;

function LevelPlay({ level }: { level: LevelDetail }) {
  const n = level.level;
  const attempt = useAttempt(n);
  const reset = useResetHistory(n);
  const [entries, setEntries] = useState<ChatEntry[]>(() =>
    level.history.map((m) => ({ id: newId(), role: m.role, content: m.content, blockedBy: m.blockedBy })),
  );

  async function send(message: string): Promise<boolean> {
    const userEntry: ChatEntry = { id: newId(), role: 'user', content: message };
    setEntries((prev) => [...prev, userEntry]);
    try {
      const res = await attempt.mutateAsync({ message });
      setEntries((prev) => [...prev, { id: newId(), role: 'assistant', content: res.reply, blockedBy: res.blockedBy ?? undefined }]);
      return true;
    } catch (err) {
      // The attempt never happened: drop the optimistic message and explain why.
      setEntries((prev) => [...prev.filter((e) => e.id !== userEntry.id), { id: newId(), role: 'error', content: describeError(err) }]);
      return false;
    }
  }

  async function resetConversation() {
    if (!window.confirm('Clear the conversation? The agent will forget everything you said.')) return;
    await reset.mutateAsync();
    setEntries([]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Chat entries={entries} pending={attempt.isPending} onSend={send} />
      </div>
      <aside className="space-y-4">
        <SubmitSecret level={n} alreadyCleared={level.cleared} />
        <button
          onClick={() => void resetConversation()}
          disabled={reset.isPending || attempt.isPending}
          className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-40"
        >
          ↺ Reset conversation
        </button>
        {reset.isError && <p className="text-sm text-red-400">{describeError(reset.error)}</p>}
        <p className="text-xs leading-relaxed text-slate-500">
          The agent remembers your last 10 messages. Your secret is unique to you, so sharing answers won't help anyone.
        </p>
      </aside>
    </div>
  );
}

export function Level() {
  const token = useToken();
  const params = useParams();
  const n = Number(params.n);
  const level = useLevel(n);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => top.current?.scrollIntoView(), [n]);

  if (!token) return <Navigate to="/" replace />;

  if (level.isPending) return <p className="text-slate-500">Loading…</p>;

  if (level.isError) {
    const err = level.error;
    const locked = err instanceof ApiError && err.status === 403;
    const missing = err instanceof ApiError && (err.status === 404 || err.status === 400);
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-lg font-semibold">{locked ? '🔒 Locked' : missing ? 'No such level' : 'Something went wrong'}</p>
        <p className="mt-1 text-slate-400">{locked ? `Clear level ${n - 1} first.` : missing ? '' : describeError(err)}</p>
        <Link to="/" className="mt-4 inline-block text-emerald-400 hover:underline">
          ← Back to levels
        </Link>
      </div>
    );
  }

  const data = level.data;
  return (
    <div ref={top} className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-300">
          ← All levels
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            <span className="font-mono text-slate-500">Level {data.level} · </span>
            {data.name}
          </h1>
          <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300">{data.defense}</span>
        </div>
        <p className="mt-3 max-w-3xl text-slate-400">{data.briefing}</p>
      </div>
      {/* key: remount (fresh chat state) when moving to another level */}
      <LevelPlay key={data.level} level={data} />
    </div>
  );
}
