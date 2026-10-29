import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
import { ClassifyProcessor } from '../src/classify/classify.processor';
import { clearLevels, createTestApp, newPlayer, resetState, secretFor, TestContext } from './support/app';

const auth = (token: string) => ['Authorization', `Bearer ${token}`] as const;

describe('leaderboard', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  async function setClear(playerId: string, level: number, attemptsUsed: number, at: string) {
    await ctx.pool.query('INSERT INTO level_clears (player_id, level, attempts_used, cleared_at) VALUES ($1, $2, $3, $4)', [
      playerId,
      level,
      attemptsUsed,
      at,
    ]);
  }

  it('ranks by level desc, then total attempts asc, then last clear asc', async () => {
    const a = await newPlayer(ctx, 'alpha');
    const b = await newPlayer(ctx, 'bravo');
    const c = await newPlayer(ctx, 'charlie');
    const d = await newPlayer(ctx, 'delta');
    await newPlayer(ctx, 'echo_no_clears');
    // alpha: level 2 in 5 attempts; bravo: level 2 in 5 attempts but later; charlie: level 2 in 3; delta: level 3
    await setClear(a.id, 1, 2, '2026-01-01T10:00:00Z');
    await setClear(a.id, 2, 3, '2026-01-01T11:00:00Z');
    await setClear(b.id, 1, 4, '2026-01-01T10:00:00Z');
    await setClear(b.id, 2, 1, '2026-01-01T12:00:00Z');
    await setClear(c.id, 1, 1, '2026-01-01T13:00:00Z');
    await setClear(c.id, 2, 2, '2026-01-01T14:00:00Z');
    await setClear(d.id, 1, 50, '2026-01-02T00:00:00Z');
    await setClear(d.id, 2, 50, '2026-01-02T00:00:00Z');
    await setClear(d.id, 3, 50, '2026-01-02T00:00:00Z');

    const res = await ctx.http().get('/api/leaderboard').expect(200);
    expect(res.body.map((r: { rank: number; nickname: string; level: number; attempts: number }) => [r.rank, r.nickname, r.level, r.attempts])).toEqual([
      [1, 'delta', 3, 150],
      [2, 'charlie', 2, 3],
      [3, 'alpha', 2, 5],
      [4, 'bravo', 2, 5],
    ]);
  });

  it('feed returns recent labelled attempts without any prompt text', async () => {
    const p = await newPlayer(ctx);
    const res = await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'TOP SECRET PROMPT' }).expect(200);
    await ctx.app.get(ClassifyProcessor).process(res.body.attemptId);
    const feed = await ctx.http().get('/api/leaderboard/feed').expect(200);
    expect(feed.body).toEqual([{ level: 1, techniques: ['direct_ask'], blockedBy: null, leaked: false, at: expect.any(String) }]);
    expect(JSON.stringify(feed.body)).not.toContain('TOP SECRET');
  });

  describe('live gateway /live', () => {
    let socket: Socket;
    let events: { name: string; data: unknown }[];

    beforeAll(async () => {
      await ctx.app.listen(0);
      const { port } = ctx.app.getHttpServer().address() as AddressInfo;
      socket = io(`http://localhost:${port}/live`, { transports: ['websocket'] });
      await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
      socket.onAny((name: string, data: unknown) => events.push({ name, data }));
    });
    afterAll(() => {
      socket.close();
    });
    beforeEach(() => (events = []));

    const until = async (pred: () => boolean) => {
      for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20));
    };

    it('broadcasts level_cleared once, on the first clear only', async () => {
      const p = await newPlayer(ctx, 'speedrunner');
      await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'x' }).expect(200);
      await clearLevels(ctx, p, 1);
      const secret = await secretFor(ctx, p.id, 1);
      await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret }).expect(200);
      await until(() => events.length > 0);
      await new Promise((r) => setTimeout(r, 100));
      expect(events).toEqual([{ name: 'level_cleared', data: { nickname: 'speedrunner', level: 1, attempts: 1 } }]);
    });

    it('submit response never includes the internal firstClear flag', async () => {
      const p = await newPlayer(ctx);
      await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
      const secret = await secretFor(ctx, p.id, 1);
      const res = await ctx.http().post('/api/levels/1/submit').set(...auth(p.token)).send({ secret }).expect(200);
      expect(res.body).toEqual({ correct: true, level: 1, attemptsUsed: 0 });
    });

    it('broadcasts attempt labels after classification, never the prompt', async () => {
      const p = await newPlayer(ctx);
      ctx.agent.next = { blockedBy: 'output_filter' };
      const res = await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'SECRET PROMPT TEXT' }).expect(200);
      await ctx.app.get(ClassifyProcessor).process(res.body.attemptId);
      await until(() => events.length > 0);
      expect(events).toEqual([{ name: 'attempt', data: { level: 1, techniques: ['direct_ask'], blockedBy: 'output_filter', leaked: false } }]);
      expect(JSON.stringify(events)).not.toContain('SECRET PROMPT');
    });
  });
});
