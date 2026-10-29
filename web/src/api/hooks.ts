import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, tokenStore } from './client';
import type { AttemptResult, LevelDetail, LevelSummary, Player, SubmitResult } from './types';

export function useToken(): string | null {
  return useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null);
}

export function useMe() {
  const token = useToken();
  return useQuery({ queryKey: ['me', token], queryFn: () => api<Player>('/api/auth/me'), enabled: !!token });
}

export function useCreateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nickname: string) =>
      api<{ token: string; player: Player }>('/api/auth/guest', { method: 'POST', body: { nickname } }),
    onSuccess: ({ token }) => {
      tokenStore.set(token);
      void qc.invalidateQueries();
    },
  });
}

export function useLevels() {
  const token = useToken();
  return useQuery({ queryKey: ['levels', token], queryFn: () => api<LevelSummary[]>('/api/levels'), enabled: !!token });
}

export function useLevel(n: number) {
  const token = useToken();
  return useQuery({
    queryKey: ['level', n, token],
    queryFn: () => api<LevelDetail>(`/api/levels/${n}`),
    enabled: !!token && Number.isInteger(n),
    retry: false,
    // Always load fresh: the chat is seeded from this history once, on mount.
    gcTime: 0,
  });
}

export function useAttempt(n: number) {
  return useMutation({
    mutationFn: (body: { message: string; inboxEmail?: string }) =>
      api<AttemptResult>(`/api/levels/${n}/attempts`, { method: 'POST', body }),
  });
}

export function useSubmitSecret(n: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (secret: string) => api<SubmitResult>(`/api/levels/${n}/submit`, { method: 'POST', body: { secret } }),
    onSuccess: (res) => {
      if (res.correct) {
        void qc.invalidateQueries({ queryKey: ['levels'] });
        void qc.invalidateQueries({ queryKey: ['level', n] });
      }
    },
  });
}

export function useResetHistory(n: number) {
  return useMutation({ mutationFn: () => api<void>(`/api/levels/${n}/history`, { method: 'DELETE' }) });
}
