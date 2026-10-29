import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { hexEqual, sha256Hex } from '../common/crypto';
import { PG_POOL, REDIS } from '../db/db.module';
import { getLevelDef, isUnlocked, LevelDef, LEVELS } from './levels.data';
import { generateSecret } from './secret-words';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type SubmitResult = { correct: false } | { correct: true; level: number; attemptsUsed: number };

const HISTORY_LIMIT = 10;
const secretKey = (playerId: string, level: number) => `secret:${playerId}:${level}`;
const historyKey = (playerId: string, level: number) => `history:${playerId}:${level}`;

/** Submitted secrets are compared case-insensitively and trimmed; issued ones are uppercase. */
const normaliseSubmission = (s: string) => s.trim().toUpperCase();

@Injectable()
export class LevelsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async clearedLevels(playerId: string): Promise<Set<number>> {
    const { rows } = await this.pool.query<{ level: number }>('SELECT level FROM level_clears WHERE player_id = $1', [playerId]);
    return new Set(rows.map((r) => r.level));
  }

  async list(playerId: string) {
    const cleared = await this.clearedLevels(playerId);
    return LEVELS.map((l) => ({ ...l, unlocked: isUnlocked(l.level, cleared), cleared: cleared.has(l.level) }));
  }

  /** 404 for unknown levels, 403 for locked ones. */
  async assertPlayable(playerId: string, level: number): Promise<LevelDef> {
    const def = getLevelDef(level);
    if (!def) throw new NotFoundException(`Level ${level} does not exist`);
    if (!isUnlocked(level, await this.clearedLevels(playerId))) {
      throw new ForbiddenException(`Clear level ${level - 1} first`);
    }
    return def;
  }

  async open(playerId: string, level: number) {
    const def = await this.assertPlayable(playerId, level);
    await this.ensureSecret(playerId, level);
    const cleared = await this.clearedLevels(playerId);
    return { ...def, cleared: cleared.has(level), history: await this.history(playerId, level) };
  }

  /**
   * Returns the player's secret for the level, issuing one on first use.
   * Plaintext lives only in Redis (the agent needs it); Postgres keeps the hash.
   */
  async ensureSecret(playerId: string, level: number): Promise<string> {
    const key = secretKey(playerId, level);
    const existing = await this.redis.get(key);
    if (existing) return existing;

    const fresh = generateSecret();
    // NX: if two requests race, both end up with whichever secret was set first.
    await this.redis.set(key, fresh, 'NX');
    const secret = (await this.redis.get(key)) ?? fresh;
    try {
      await this.pool.query(
        `INSERT INTO level_secrets (player_id, level, secret_hash) VALUES ($1, $2, $3)
         ON CONFLICT (player_id, level) DO UPDATE SET secret_hash = EXCLUDED.secret_hash`,
        [playerId, level, sha256Hex(secret)],
      );
    } catch (err) {
      // Without the hash the secret could never be submitted; drop it so the next call reissues.
      await this.redis.del(key);
      throw err;
    }
    return secret;
  }

  async submit(playerId: string, level: number, submitted: string): Promise<SubmitResult> {
    await this.assertPlayable(playerId, level);
    const { rows } = await this.pool.query<{ secret_hash: string }>(
      'SELECT secret_hash FROM level_secrets WHERE player_id = $1 AND level = $2',
      [playerId, level],
    );
    const stored = rows[0]?.secret_hash;
    if (!stored || !hexEqual(sha256Hex(normaliseSubmission(submitted)), stored)) return { correct: false };

    // First clear wins; later correct submissions report the original numbers.
    const { rows: clear } = await this.pool.query<{ attempts_used: number }>(
      `WITH ins AS (
         INSERT INTO level_clears (player_id, level, attempts_used)
         SELECT $1, $2, count(*) FROM attempts WHERE player_id = $1 AND level = $2
         ON CONFLICT (player_id, level) DO NOTHING
         RETURNING attempts_used
       )
       SELECT attempts_used FROM ins
       UNION ALL
       SELECT attempts_used FROM level_clears WHERE player_id = $1 AND level = $2
       LIMIT 1`,
      [playerId, level],
    );
    return { correct: true, level, attemptsUsed: clear[0].attempts_used };
  }

  async history(playerId: string, level: number): Promise<HistoryMessage[]> {
    const raw = await this.redis.lrange(historyKey(playerId, level), 0, -1);
    return raw.map((r) => JSON.parse(r) as HistoryMessage);
  }

  async appendHistory(playerId: string, level: number, messages: HistoryMessage[]): Promise<void> {
    const key = historyKey(playerId, level);
    await this.redis
      .multi()
      .rpush(key, ...messages.map((m) => JSON.stringify(m)))
      .ltrim(key, -HISTORY_LIMIT, -1)
      .exec();
  }

  async resetHistory(playerId: string, level: number): Promise<void> {
    await this.redis.del(historyKey(playerId, level));
  }
}
