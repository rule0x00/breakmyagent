import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace } from 'socket.io';

export interface LevelClearedEvent {
  nickname: string;
  level: number;
  attempts: number;
}

/** Never carries prompt text: only labels and outcomes. */
export interface AttemptEvent {
  level: number;
  techniques: string[];
  blockedBy: string | null;
  leaked: boolean;
}

@WebSocketGateway({ namespace: '/live' })
export class LeaderboardGateway {
  @WebSocketServer()
  private readonly server?: Namespace;

  levelCleared(event: LevelClearedEvent): void {
    this.server?.emit('level_cleared', event);
  }

  attempt(event: AttemptEvent): void {
    this.server?.emit('attempt', event);
  }
}
