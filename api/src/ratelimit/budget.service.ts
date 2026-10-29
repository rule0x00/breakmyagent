import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { REDIS } from '../db/db.module';
import { msUntilUtcMidnight, utcDay } from './time';

// Stored as integer micro-dollars so INCRBY stays exact for sub-cent costs.
const MICRO = 1_000_000;
const budgetKey = (now: number) => `budget:micro_usd:${utcDay(now)}`;

/**
 * Global daily LLM spend guard (this is a public demo: protect the wallet).
 * Spend is an estimate from token counts x configured prices, per UTC day.
 */
@Injectable()
export class BudgetService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async spentUsd(now = Date.now()): Promise<number> {
    return Number((await this.redis.get(budgetKey(now))) ?? 0) / MICRO;
  }

  async isExhausted(now = Date.now()): Promise<boolean> {
    return (await this.spentUsd(now)) >= this.env.DAILY_BUDGET_USD;
  }

  async assertAvailable(now = Date.now()): Promise<void> {
    if (await this.isExhausted(now)) {
      throw new ServiceUnavailableException('Agent is resting, back tomorrow');
    }
  }

  async record(costUsd: number, now = Date.now()): Promise<void> {
    const micros = Math.round(costUsd * MICRO);
    if (micros <= 0) return;
    const key = budgetKey(now);
    // Keep the key a day past midnight so late reads of "today" still work.
    await this.redis.multi().incrby(key, micros).pexpire(key, msUntilUtcMidnight(now) + 86_400_000).exec();
  }
}
