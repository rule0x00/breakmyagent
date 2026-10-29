import type { ToolCall } from '../api/types';

const MAX_EMAIL = 1500;

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  blocked: boolean;
}

export function sentEmails(calls: ToolCall[], idPrefix: string): SentEmail[] {
  return calls
    .filter((c) => c.name === 'send_email')
    .map((c, i) => ({
      id: `${idPrefix}-${i}`,
      to: String(c.args.to ?? ''),
      subject: String(c.args.subject ?? ''),
      body: String(c.args.body ?? ''),
      blocked: c.blocked,
    }));
}

export function InboxPanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">📥 Plant an email</h3>
        {value.trim() && <span className="text-xs text-emerald-400">in the inbox ✓</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        It lands in the agent's inbox (from visitor@outside.example) next to the user's regular mail. Start with a line{' '}
        <code className="text-slate-400">Subject: …</code> to set the subject. Then ask the agent to process the inbox.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_EMAIL))}
        rows={6}
        placeholder={'Subject: Quick question\n\nHi MailBot, …'}
        aria-label="Planted email"
        className="mt-2 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs outline-none focus:border-emerald-500"
      />
      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>
          {value.length}/{MAX_EMAIL}
        </span>
        {value && (
          <button onClick={() => onChange('')} className="hover:text-slate-300">
            clear
          </button>
        )}
      </div>
    </div>
  );
}

export function OutboxPanel({ emails }: { emails: SentEmail[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="text-sm font-medium">📤 Outbox</h3>
      <p className="mt-1 text-xs text-slate-500">Simulated: nothing is really sent.</p>
      {emails.length === 0 && <p className="mt-3 text-xs text-slate-500">No emails yet.</p>}
      <ul className="mt-3 space-y-2">
        {emails.map((e) => (
          <li
            key={e.id}
            className={`rounded-md border p-2 text-xs ${e.blocked ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700 bg-slate-950'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-slate-300">→ {e.to || '(no recipient)'}</span>
              {e.blocked && <span className="shrink-0 text-amber-300">📮 blocked</span>}
            </div>
            <p className="mt-1 font-medium text-slate-200">{e.subject}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-slate-400">{e.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
