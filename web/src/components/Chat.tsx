import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { BlockedBy } from '../api/types';
import { BlockedBadge } from './BlockedBadge';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  blockedBy?: BlockedBy;
}

/** The agent only sees the last 10 messages; older ones are shown dimmed. */
export const AGENT_MEMORY = 10;
const MAX_LEN = 1000;

interface Props {
  entries: ChatEntry[];
  pending: boolean;
  onSend: (message: string) => Promise<boolean>;
}

export function Chat({ entries, pending, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries.length, pending]);

  // Index of the first message still inside the agent's memory window.
  const conversational = entries.filter((e) => e.role !== 'error');
  const firstRemembered = conversational.length > AGENT_MEMORY ? conversational[conversational.length - AGENT_MEMORY].id : null;
  let forgotten = firstRemembered !== null;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const message = draft.trim();
    if (!message || pending) return;
    setDraft('');
    const ok = await onSend(message);
    if (!ok) setDraft(message); // keep it so the player can retry
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[32rem] flex-col rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {entries.length === 0 && (
          <p className="pt-8 text-center text-sm text-slate-500">Say something to the agent. It knows the secret.</p>
        )}
        {entries.map((entry) => {
          if (entry.id === firstRemembered) forgotten = false;
          const dim = forgotten && entry.role !== 'error';
          if (entry.role === 'error') {
            return (
              <p key={entry.id} className="text-center text-sm text-red-400">
                {entry.content}
              </p>
            );
          }
          const mine = entry.role === 'user';
          return (
            <div key={entry.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${dim ? 'opacity-40' : ''}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${
                  mine ? 'bg-emerald-600/90 text-white' : 'bg-slate-800 text-slate-100'
                }`}
                title={dim ? 'The agent no longer remembers this message' : undefined}
              >
                {entry.blockedBy && (
                  <div className="mb-1">
                    <BlockedBadge by={entry.blockedBy} />
                  </div>
                )}
                {entry.content}
              </div>
            </div>
          );
        })}
        {pending && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-2xl bg-slate-800 px-4 py-2 text-sm text-slate-400">Agent is thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-slate-800 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Your message… (Enter to send, Shift+Enter for a new line)"
          aria-label="Message to the agent"
          className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {draft.length}/{MAX_LEN}
          </span>
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
