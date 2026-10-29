import { createHash } from 'node:crypto';
import { isUnlocked } from '../src/levels/levels.data';
import { clearLevels, createTestApp, newPlayer, resetState, secretFor, TestContext } from './support/app';

describe('isUnlocked', () => {
  it('level 1 is always open', () => expect(isUnlocked(1, new Set())).toBe(true));
  it('level N needs N-1 cleared', () => {
    expect(isUnlocked(2, new Set())).toBe(false);
    expect(isUnlocked(2, new Set([1]))).toBe(true);
    expect(isUnlocked(3, new Set([1]))).toBe(false);
    expect(isUnlocked(5, new Set([4]))).toBe(true);
  });
  it('out-of-range levels are never open', () => {
    expect(isUnlocked(0, new Set([1, 2, 3, 4, 5]))).toBe(false);
    expect(isUnlocked(6, new Set([1, 2, 3, 4, 5]))).toBe(false);
  });
});

describe('levels API', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  const auth = (token: string) => ['Authorization', `Bearer ${token}`] as const;

  describe('unlocking', () => {
    it('lists all levels with only level 1 unlocked for a new player', async () => {
      const p = await newPlayer(ctx);
      const res = await ctx.http().get('/api/levels').set(...auth(p.token)).expect(200);
      expect(res.body.map((l: { level: number; unlocked: boolean }) => [l.level, l.unlocked])).toEqual([
        [1, true],
        [2, false],
        [3, false],
        [4, false],
        [5, false],
      ]);
    });

    it('blocks opening, playing and submitting a locked level', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().get('/api/levels/2').set(...auth(p.token)).expect(403);
      await ctx.http().post('/api/levels/2/attempts').set(...auth(p.token)).send({ message: 'hi' }).expect(403);
      await ctx.http().post('/api/levels/2/submit').set(...auth(p.token)).send({ secret: 'X-0000' }).expect(403);
      expect(ctx.agent.requests).toHaveLength(0);
    });

    it('unlocks level N+1 after clearing level N, and no further', async () => {
      const p = await newPlayer(ctx);
      await clearLevels(ctx, p, 1);
      await ctx.http().get('/api/levels/2').set(...auth(p.token)).expect(200);
      await ctx.http().get('/api/levels/3').set(...auth(p.token)).expect(403);
      const list = await ctx.http().get('/api/levels').set(...auth(p.token)).expect(200);
      expect(list.body[0]).toMatchObject({ level: 1, cleared: true, unlocked: true });
      expect(list.body[1]).toMatchObject({ level: 2, cleared: false, unlocked: true });
    });

    it('404s on levels that do not exist', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().get('/api/levels/6').set(...auth(p.token)).expect(404);
      await ctx.http().get('/api/levels/abc').set(...auth(p.token)).expect(400);
    });
  });

  describe('secrets', () => {
    it('issues a WORD-1234 secret on first open: plaintext in Redis, only the hash in Postgres', async () => {
      const p = await newPlayer(ctx);
      const res = await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/[A-Z]+-\d{4}/);
      const secret = await secretFor(ctx, p.id, 1);
      expect(secret).toMatch(/^[A-Z]+-\d{4}$/);
      const { rows } = await ctx.pool.query('SELECT secret_hash FROM level_secrets WHERE player_id = $1', [p.id]);
      expect(rows).toEqual([{ secret_hash: createHash('sha256').update(secret).digest('hex') }]);
      expect(await ctx.redis.ttl(`secret:${p.id}:1`)).toBe(-1); // no expiry
    });

    it('keeps the same secret on reopen and gives different players different secrets', async () => {
      const a = await newPlayer(ctx);
      const b = await newPlayer(ctx);
      await ctx.http().get('/api/levels/1').set(...auth(a.token)).expect(200);
      const first = await secretFor(ctx, a.id, 1);
      await ctx.http().get('/api/levels/1').set(...auth(a.token)).expect(200);
      expect(await secretFor(ctx, a.id, 1)).toBe(first);
      await ctx.http().get('/api/levels/1').set(...auth(b.token)).expect(200);
      // Collisions are possible in principle; the word list x 10k digits makes them ~1e-6.
      expect(await secretFor(ctx, b.id, 1)).not.toBe(first);
    });
  });

  describe('submit', () => {
    it('rejects a wrong secret without clearing', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
      const res = await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret: 'WRONG-0000' }).expect(200);
      expect(res.body).toEqual({ correct: false });
      const { rowCount } = await ctx.pool.query('SELECT 1 FROM level_clears');
      expect(rowCount).toBe(0);
    });

    it('accepts the right secret regardless of case and surrounding whitespace', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
      const secret = await secretFor(ctx, p.id, 1);
      const res = await ctx
        .http()
        .post('/api/levels/1/submit')
        .set(...auth(p.token))
        .send({ secret: `  ${secret.toLowerCase()}\n` })
        .expect(200);
      expect(res.body).toMatchObject({ correct: true, level: 1 });
    });

    it('records attempts used and is idempotent', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
      for (let i = 0; i < 3; i++) {
        await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: `try ${i}` }).expect(200);
      }
      const secret = await secretFor(ctx, p.id, 1);
      const first = await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret }).expect(200);
      expect(first.body).toEqual({ correct: true, level: 1, attemptsUsed: 3 });
      await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'after clear' }).expect(200);
      const again = await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret }).expect(200);
      expect(again.body).toEqual({ correct: true, level: 1, attemptsUsed: 3 });
    });

    it("rejects another player's secret", async () => {
      const a = await newPlayer(ctx);
      const b = await newPlayer(ctx);
      await ctx.http().get('/api/levels/1').set(...auth(a.token)).expect(200);
      await ctx.http().get('/api/levels/1').set(...auth(b.token)).expect(200);
      const secretA = await secretFor(ctx, a.id, 1);
      const res = await ctx.http().post('/api/levels/1/submit').set(...auth(b.token)).send({ secret: secretA }).expect(200);
      expect(res.body).toEqual({ correct: false });
    });

    it('validates the body', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({}).expect(400);
      await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret: 'x'.repeat(101) }).expect(400);
    });
  });
});
