import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  level: number;
  attempts: number;
  lastClearAt: string;
}

export interface FeedItem {
  level: number;
  techniques: string[];
  blockedBy: string | null;
  leaked: boolean;
  at: string;
}

@Injectable()
export class LeaderboardService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Highest level cleared (desc) -> total attempts to get there (asc) -> time of last clear (asc). */
  async top(limit = 50): Promise<LeaderboardRow[]> {
    const { rows } = await this.pool.query<{ nickname: string; level: number; attempts: string; last_clear: Date }>(
      `SELECT p.nickname, max(c.level) AS level, sum(c.attempts_used) AS attempts, max(c.cleared_at) AS last_clear
         FROM level_clears c JOIN players p ON p.id = c.player_id
        GROUP BY p.id, p.nickname
        ORDER BY level DESC, attempts ASC, last_clear ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r, i) => ({
      rank: i + 1,
      nickname: r.nickname,
      level: r.level,
      attempts: Number(r.attempts),
      lastClearAt: r.last_clear.toISOString(),
    }));
  }

  /** Recent labelled attempts for the live feed's initial state. No prompt text. */
  async recent(limit = 20): Promise<FeedItem[]> {
    const { rows } = await this.pool.query<{ level: number; techniques: string[]; blocked_by: string | null; leaked: boolean; created_at: Date }>(
      `SELECT level, techniques, blocked_by, leaked, created_at FROM attempts
        WHERE techniques IS NOT NULL ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ level: r.level, techniques: r.techniques, blockedBy: r.blocked_by, leaked: r.leaked, at: r.created_at.toISOString() }));
  }
}
