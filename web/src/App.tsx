import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3100';

export default function App() {
  const [health, setHealth] = useState<string>('checking…');

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((body: { status?: string }) => setHealth(body.status ?? 'error'))
      .catch(() => setHealth('unreachable'));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">BreakMyAgent</h1>
      <p className="mt-2 text-slate-400">
        Can you trick an AI agent into leaking its secret? 5 levels, from naive chatbot to tool-using agent.
      </p>
      <p className="mt-6 text-sm">
        API: <span className="font-mono">{health}</span>
      </p>
    </main>
  );
}
