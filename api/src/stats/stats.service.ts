import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import { MAX_LEVEL } from '../levels/levels.data';
import { TECHNIQUES } from '../play/agent.client';

const DEFENSES = ['input_guard', 'output_filter', 'egress_filter'] as const;
const rate = (part: number, whole: number) => (whole ? part / whole : 0);

/** Aggregates only: stored prompts are never exposed. */
@Injectable()
export class StatsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async overview() {
    const [totals, perLevel] = await Promise.all([
      this.pool.query<{ attempts: string; players: string; leaks: string }>(
        `SELECT (SELECT count(*) FROM attempts) AS attempts,
                (SELECT count(*) FROM players) AS players,
                (SELECT count(*) FROM attempts WHERE leaked) AS leaks`,
      ),
      this.pool.query<{ level: number; attempts: string; leaks: string; clears: string }>(
        `SELECT l.level,
                (SELECT count(*) FROM attempts a WHERE a.level = l.level) AS attempts,
                (SELECT count(*) FROM attempts a WHERE a.level = l.level AND a.leaked) AS leaks,
                (SELECT count(*) FROM level_clears c WHERE c.level = l.level) AS clears
           FROM generate_series(1, $1::int) AS l(level)`,
        [MAX_LEVEL],
      ),
    ]);
    const t = totals.rows[0];
    return {
      attempts: Number(t.attempts),
      players: Number(t.players),
      leaks: Number(t.leaks),
      levels: perLevel.rows.map((r) => ({
        level: r.level,
        attempts: Number(r.attempts),
        leaks: Number(r.leaks),
        clears: Number(r.clears),
        leakRate: rate(Number(r.leaks), Number(r.attempts)),
      })),
    };
  }

  /** Per technique: attempts, leak rate, and the same per level. Multi-label: an attempt counts once per technique. */
  async techniques() {
    const { rows } = await this.pool.query<{ technique: string; level: number; attempts: string; leaks: string }>(
      `SELECT t.technique, a.level, count(*) AS attempts, count(*) FILTER (WHERE a.leaked) AS leaks
         FROM attempts a CROSS JOIN LATERAL unnest(a.techniques) AS t(technique)
        GROUP BY t.technique, a.level`,
    );
    return TECHNIQUES.map((technique) => {
      const mine = rows.filter((r) => r.technique === technique);
      const attempts = mine.reduce((s, r) => s + Number(r.attempts), 0);
      const leaks = mine.reduce((s, r) => s + Number(r.leaks), 0);
      return {
        technique,
        attempts,
        leaks,
        leakRate: rate(leaks, attempts),
        perLevel: Array.from({ length: MAX_LEVEL }, (_, i) => {
          const row = mine.find((r) => r.level === i + 1);
          const a = Number(row?.attempts ?? 0);
          const l = Number(row?.leaks ?? 0);
          return { level: i + 1, attempts: a, leaks: l, leakRate: rate(l, a) };
        }),
      };
    });
  }

  /** How often each defense fired, overall and per level. */
  async defenses() {
    const { rows } = await this.pool.query<{ blocked_by: string; level: number; count: string }>(
      `SELECT blocked_by, level, count(*) AS count FROM attempts WHERE blocked_by IS NOT NULL GROUP BY blocked_by, level`,
    );
    return DEFENSES.map((defense) => {
      const mine = rows.filter((r) => r.blocked_by === defense);
      return {
        defense,
        blocked: mine.reduce((s, r) => s + Number(r.count), 0),
        perLevel: Array.from({ length: MAX_LEVEL }, (_, i) => ({
          level: i + 1,
          blocked: Number(mine.find((r) => r.level === i + 1)?.count ?? 0),
        })),
      };
    });
  }
}
