import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Leaderboard } from './pages/Leaderboard';
import { Level } from './pages/Level';
import { Stats } from './pages/Stats';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="levels/:n" element={<Level />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="stats" element={<Stats />} />
            <Route path="*" element={<p className="text-slate-400">Page not found.</p>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
