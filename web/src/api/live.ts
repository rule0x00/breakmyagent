import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from './client';
import type { FeedItem } from './types';

export interface LevelClearedEvent {
  nickname: string;
  level: number;
  attempts: number;
}

export type AttemptEvent = Omit<FeedItem, 'at'>;

/** Subscribes to the /live namespace for as long as the component is mounted. */
export function useLive(handlers: { onAttempt?: (e: AttemptEvent) => void; onLevelCleared?: (e: LevelClearedEvent) => void }) {
  const { onAttempt, onLevelCleared } = handlers;
  useEffect(() => {
    const socket = io(`${API_URL}/live`, { transports: ['websocket'] });
    if (onAttempt) socket.on('attempt', onAttempt);
    if (onLevelCleared) socket.on('level_cleared', onLevelCleared);
    return () => {
      socket.close();
    };
  }, [onAttempt, onLevelCleared]);
}
