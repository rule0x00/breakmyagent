import { BudgetService } from '../src/ratelimit/budget.service';
import { RateLimitedException, RateLimitService } from '../src/ratelimit/ratelimit.service';
import { createTestApp, newPlayer, resetState, TestContext } from './support/app';

const auth = (token: string) => ['Authorization', `Bearer ${token}`] as const;

describe('RateLimitService', () => {
  let ctx: TestContext;
  let limiter: RateLimitService;
  beforeAll(async () => {
    ctx = await createTestApp({ RATE_LIMIT_PER_MIN: 3, RATE_LIMIT_IP_PER_MIN: 5, RATE_LIMIT_PER_DAY: 4 });
    limiter = ctx.app.get(RateLimitService);
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);

  it('allows up to the per-minute limit, then rejects with a retry-after', async () => {
    for (let i = 0; i < 3; i++) await limiter.consumeAttempt('p1', 'ip1', t0 + i * 1000);
    const err = await limiter.consumeAttempt('p1', 'ip1', t0 + 10_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedException);
    // Oldest hit was at t0, so the slot frees at t0+60s: 50s from t0+10s.
    expect((err as RateLimitedException).retryAfterSeconds).toBe(50);
  });

  it('is a sliding window: a slot frees exactly when the oldest hit ages out', async () => {
    for (let i = 0; i < 3; i++) await limiter.consumeAttempt('p1', 'ip1', t0 + i * 1000);
    await expect(limiter.consumeAttempt('p1', 'ip1', t0 + 59_999)).rejects.toThrow(RateLimitedException);
    await expect(limiter.consumeAttempt('p1', 'ip1', t0 + 60_001)).resolves.toBeUndefined();
  });

  it('a rejected attempt consumes nothing', async () => {
    for (let i = 0; i < 3; i++) await limiter.consumeAttempt('p1', 'ip1', t0);
    for (let i = 0; i < 5; i++) await limiter.consumeAttempt('p1', 'ip1', t0 + 1000).catch(() => undefined);
    // If rejections had been counted against the IP, p2 on the same IP would now be blocked.
    await expect(limiter.consumeAttempt('p2', 'ip1', t0 + 2000)).resolves.toBeUndefined();
  });

  it('limits per hashed IP across players', async () => {
    await limiter.consumeAttempt('a', 'shared-ip', t0);
    await limiter.consumeAttempt('a', 'shared-ip', t0);
    await limiter.consumeAttempt('b', 'shared-ip', t0);
    await limiter.consumeAttempt('b', 'shared-ip', t0);
    await limiter.consumeAttempt('c', 'shared-ip', t0);
    await expect(limiter.consumeAttempt('d', 'shared-ip', t0)).rejects.toThrow(/IP/);
    await expect(limiter.consumeAttempt('d', 'other-ip', t0)).resolves.toBeUndefined();
  });

  it('skips the IP limit when there is no IP', async () => {
    for (const p of ['a', 'b', 'c', 'd', 'e', 'f']) await limiter.consumeAttempt(p, null, t0);
  });

  it('enforces the daily cap per UTC day, resetting at midnight', async () => {
    const day = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (let i = 0; i < 4; i++) await limiter.consumeAttempt('p1', 'ip', day + i * 120_000);
    const err = await limiter.consumeAttempt('p1', 'ip', day + 3_600_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedException);
    expect((err as RateLimitedException).message).toMatch(/daily/i);
    await expect(limiter.consumeAttempt('p1', 'ip', Date.UTC(2026, 0, 2, 0, 0, 1))).resolves.toBeUndefined();
  });

  it('limits submits separately from attempts', async () => {
    for (let i = 0; i < 10; i++) await limiter.consumeSubmit('p1', t0);
    await expect(limiter.consumeSubmit('p1', t0)).rejects.toThrow(RateLimitedException);
    await expect(limiter.consumeAttempt('p1', 'ip', t0)).resolves.toBeUndefined();
  });

  it('is atomic under concurrency', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => limiter.consumeAttempt('p1', null, t0)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  });
});

describe('BudgetService', () => {
  let ctx: TestContext;
  let budget: BudgetService;
  beforeAll(async () => {
    ctx = await createTestApp({ DAILY_BUDGET_USD: 0.01 });
    budget = ctx.app.get(BudgetService);
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  it('tracks spend per UTC day and reports exhaustion at the budget', async () => {
    const day1 = Date.UTC(2026, 0, 1, 10);
    await budget.record(0.004, day1);
    await budget.record(0.005, day1);
    expect(await budget.isExhausted(day1)).toBe(false);
    await budget.record(0.001, day1);
    expect(await budget.isExhausted(day1)).toBe(true);
    expect(await budget.isExhausted(Date.UTC(2026, 0, 2, 0, 0, 1))).toBe(false);
  });

  it('accumulates sub-cent costs without losing precision', async () => {
    const now = Date.UTC(2026, 0, 1, 10);
    for (let i = 0; i < 500; i++) await budget.record(0.00002, now);
    expect(await budget.spentUsd(now)).toBeCloseTo(0.01, 9);
  });
});

describe('play endpoint limits', () => {
  let ctx: TestContext;
  afterEach(() => ctx.close());

  it('11th attempt in a minute -> 429 with Retry-After, and the agent is not called', async () => {
    ctx = await createTestApp();
    await resetState(ctx);
    const p = await newPlayer(ctx);
    for (let i = 0; i < 10; i++) {
      await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: `m${i}` }).expect(200);
    }
    const res = await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'm10' }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/too many/i);
    expect(ctx.agent.requests).toHaveLength(10);
  });

  it('invalid bodies are rejected before they count against the limit', async () => {
    ctx = await createTestApp({ RATE_LIMIT_PER_MIN: 1 });
    await resetState(ctx);
    const p = await newPlayer(ctx);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: '' }).expect(400);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'ok' }).expect(200);
  });

  it('11th submit in a minute -> 429 (stops brute-forcing the secret)', async () => {
    ctx = await createTestApp();
    await resetState(ctx);
    const p = await newPlayer(ctx);
    for (let i = 0; i < 10; i++) {
      await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret: `GUESS-${i}` }).expect(200);
    }
    await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret: 'GUESS-X' }).expect(429);
  });

  it('returns 503 once the daily budget is spent, without calling the agent or using up rate limit', async () => {
    // Each fake attempt costs $0.00002 (100 in + 20 out tokens).
    ctx = await createTestApp({ DAILY_BUDGET_USD: 0.00004, RATE_LIMIT_PER_MIN: 3 });
    await resetState(ctx);
    const p = await newPlayer(ctx);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'a' }).expect(200);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'b' }).expect(200);
    for (let i = 0; i < 3; i++) {
      const res = await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'c' }).expect(503);
      expect(res.body.message).toBe('Agent is resting, back tomorrow');
    }
    expect(ctx.agent.requests).toHaveLength(2);
    // Budget back (e.g. raised): the 503s didn't burn the per-minute quota (2 of 3 used).
    const budgetKeys = await ctx.redis.keys('budget:*');
    await ctx.redis.del(...budgetKeys);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'd' }).expect(200);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'e' }).expect(429);
  });
});
