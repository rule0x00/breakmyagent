import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { REDIS } from '../db/db.module';
import { msUntilUtcMidnight, utcDay } from './time';

export class RateLimitedException extends HttpException {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message, retryAfter: retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

interface Limit {
  key: string;
  /** "sliding": sorted-set log over `windowMs`; "fixed": counter that expires after `windowMs`. */
  kind: 'sliding' | 'fixed';
  limit: number;
  windowMs: number;
  message: string;
}

const MINUTE_MS = 60_000;

/**
 * Checks every limit, and only if all pass, records the hit against all of them,
 * in one Lua script so concurrent requests can't slip past. Returns
 * {0, 0} on success or {index (1-based), retryAfterMs} for the first limit hit.
 */
const CONSUME_SCRIPT = `
local now = tonumber(ARGV[1])
local member = ARGV[2]
for i = 1, #KEYS do
  local base = 3 + (i - 1) * 3
  local kind, limit, win = ARGV[base], tonumber(ARGV[base + 1]), tonumber(ARGV[base + 2])
  if kind == 'sliding' then
    redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - win)
    if redis.call('ZCARD', KEYS[i]) >= limit then
      local oldest = redis.call('ZRANGE', KEYS[i], 0, 0, 'WITHSCORES')
      return {i, tonumber(oldest[2]) + win - now}
    end
  else
    if tonumber(redis.call('GET', KEYS[i]) or '0') >= limit then
      return {i, redis.call('PTTL', KEYS[i])}
    end
  end
end
for i = 1, #KEYS do
  local base = 3 + (i - 1) * 3
  local kind, win = ARGV[base], tonumber(ARGV[base + 2])
  if kind == 'sliding' then
    redis.call('ZADD', KEYS[i], now, member)
    redis.call('PEXPIRE', KEYS[i], win)
  elseif redis.call('INCR', KEYS[i]) == 1 then
    redis.call('PEXPIRE', KEYS[i], win)
  end
end
return {0, 0}
`;

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Per player: N/min and N/UTC day. Per hashed IP: N/min. */
  async consumeAttempt(playerId: string, ipHash: string | null, now = Date.now()): Promise<void> {
    const limits: Limit[] = [
      {
        key: `rl:attempt:min:${playerId}`,
        kind: 'sliding',
        limit: this.env.RATE_LIMIT_PER_MIN,
        windowMs: MINUTE_MS,
        message: 'Too many attempts, slow down',
      },
    ];
    if (ipHash) {
      limits.push({
        key: `rl:attempt:ip:${ipHash}`,
        kind: 'sliding',
        limit: this.env.RATE_LIMIT_IP_PER_MIN,
        windowMs: MINUTE_MS,
        message: 'Too many attempts from this IP, slow down',
      });
    }
    limits.push({
      key: `rl:attempt:day:${playerId}:${utcDay(now)}`,
      kind: 'fixed',
      limit: this.env.RATE_LIMIT_PER_DAY,
      windowMs: msUntilUtcMidnight(now),
      message: 'Too many attempts today: daily limit reached, come back tomorrow',
    });
    await this.consume(limits, now);
  }

  /** Stops brute-forcing the secret through the submit endpoint. */
  async consumeSubmit(playerId: string, now = Date.now()): Promise<void> {
    await this.consume(
      [
        {
          key: `rl:submit:min:${playerId}`,
          kind: 'sliding',
          limit: this.env.RATE_LIMIT_SUBMIT_PER_MIN,
          windowMs: MINUTE_MS,
          message: 'Too many guesses, slow down',
        },
      ],
      now,
    );
  }

  private async consume(limits: Limit[], now: number): Promise<void> {
    const args = limits.flatMap((l) => [l.kind, String(l.limit), String(Math.max(1, l.windowMs))]);
    const [index, retryMs] = (await this.redis.eval(
      CONSUME_SCRIPT,
      limits.length,
      ...limits.map((l) => l.key),
      String(now),
      `${now}-${randomUUID()}`,
      ...args,
    )) as [number, number];
    if (index > 0) {
      throw new RateLimitedException(limits[index - 1].message, Math.max(1, Math.ceil(retryMs / 1000)));
    }
  }
}
