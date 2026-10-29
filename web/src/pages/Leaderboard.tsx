import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { describeError } from '../api/client';
import { useFeed, useLeaderboard } from '../api/hooks';
import { useLive, type AttemptEvent, type LevelClearedEvent } from '../api/live';
import type { FeedItem } from '../api/types';
import { DEFENSE_LABELS, TECHNIQUE_LABELS } from '../labels';

const FEED_SIZE = 30;

type FeedEntry = ({ kind: 'attempt' } & FeedItem) | ({ kind: 'clear'; at: string } & LevelClearedEvent);

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function Outcome({ item }: { item: FeedItem }) {
  if (item.leaked) return <span className="text-red-300">💥 leaked</span>;
  if (item.blockedBy) return <span className="text-amber-300">🛡️ {DEFENSE_LABELS[item.blockedBy]}</span>;
  return <span className="text-slate-500">held</span>;
}

export function Leaderboard() {
  const qc = useQueryClient();
  const board = useLeaderboard();
  const initialFeed = useFeed();
  const [live, setLive] = useState<FeedEntry[]>([]);

  const onAttempt = useCallback((e: AttemptEvent) => {
    setLive((prev) => [{ kind: 'attempt' as const, ...e, at: new Date().toISOString() }, ...prev].slice(0, FEED_SIZE));
  }, []);
  const onLevelCleared = useCallback(
    (e: LevelClearedEvent) => {
      setLive((prev) => [{ kind: 'clear' as const, ...e, at: new Date().toISOString() }, ...prev].slice(0, FEED_SIZE));
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    [qc],
  );
  useLive({ onAttempt, onLevelCleared });

  const feed: FeedEntry[] = [...live, ...(initialFeed.data ?? []).map((f) => ({ kind: 'attempt' as const, ...f }))].slice(0, FEED_SIZE);

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <section className="lg:col-span-3">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-400">Highest level cleared, then fewest attempts, then who got there first.</p>
        {board.isPending && <p className="mt-4 text-slate-500">Loading…</p>}
        {board.isError && <p className="mt-4 text-red-400">{describeError(board.error)}</p>}
        {board.data && board.data.length === 0 && <p className="mt-4 text-slate-500">Nobody has cleared a level yet. Be the first.</p>}
        {board.data && board.data.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Level</th>
                  <th className="px-3 py-2 text-right">Attempts</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Last clear</th>
                </tr>
              </thead>
              <tbody>
                {board.data.map((r) => (
                  <tr key={r.nickname} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-mono text-slate-500">{r.rank}</td>
                    <td className="px-3 py-2 font-mono">{r.nickname}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.level}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.attempts}</td>
                    <td className="hidden px-3 py-2 text-right text-slate-500 sm:table-cell">{timeAgo(r.lastClearAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lg:col-span-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live attacks
        </h2>
        <p className="mt-1 text-sm text-slate-400">Labelled by a classifier. Prompts are never shown.</p>
        {feed.length === 0 && <p className="mt-4 text-sm text-slate-500">Waiting for the first attack…</p>}
        <ul className="mt-4 space-y-2">
          {feed.map((item, i) =>
            item.kind === 'clear' ? (
              <li key={`c${i}`} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                🏆 <span className="font-mono">{item.nickname}</span> cleared level {item.level} in {item.attempts} attempt
                {item.attempts === 1 ? '' : 's'}
              </li>
            ) : (
              <li key={`a${i}`} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-500">L{item.level}</span>
                  <Outcome item={item} />
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.techniques.length === 0 && <span className="text-xs text-slate-500">unlabelled</span>}
                  {item.techniques.map((t) => (
                    <span key={t} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {TECHNIQUE_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
