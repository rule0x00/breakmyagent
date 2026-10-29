import { createTestApp, resetState, TestContext } from './support/app';

describe('guest auth', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  it('creates a guest and returns a working token', async () => {
    const res = await ctx.http().post('/api/auth/guest').send({ nickname: 'neo_42' }).expect(201);
    expect(res.body.player).toMatchObject({ nickname: 'neo_42' });
    const me = await ctx.http().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
    expect(me.body).toEqual(res.body.player);
  });

  it('stores only a hash of the IP', async () => {
    await ctx.http().post('/api/auth/guest').set('X-Forwarded-For', '203.0.113.9').send({ nickname: 'trinity' }).expect(201);
    const { rows } = await ctx.pool.query('SELECT ip_hash FROM players');
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.9');
  });

  it.each([['ab'], ['a'.repeat(21)], ['has space'], ['emoji🙂'], ['']])('rejects nickname %p', async (nickname) => {
    await ctx.http().post('/api/auth/guest').send({ nickname }).expect(400);
  });

  it('rejects profane nicknames, including leet variants', async () => {
    await ctx.http().post('/api/auth/guest').send({ nickname: 'shit_lord' }).expect(400);
    await ctx.http().post('/api/auth/guest').send({ nickname: 'sh1tlord' }).expect(400);
  });

  it('rejects duplicate nicknames case-insensitively', async () => {
    await ctx.http().post('/api/auth/guest').send({ nickname: 'Morpheus' }).expect(201);
    await ctx.http().post('/api/auth/guest').send({ nickname: 'morpheus' }).expect(409);
  });

  it('rejects missing, malformed and tampered tokens', async () => {
    const res = await ctx.http().post('/api/auth/guest').send({ nickname: 'cypher' }).expect(201);
    const token: string = res.body.token;
    await ctx.http().get('/api/levels').expect(401);
    await ctx.http().get('/api/levels').set('Authorization', 'Bearer nope').expect(401);
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: '00000000-0000-0000-0000-000000000000' })).toString('base64url');
    await ctx.http().get('/api/levels').set('Authorization', `Bearer ${h}.${forged}.${s}`).expect(401);
  });

  it('rejects a valid token for a player that no longer exists', async () => {
    const res = await ctx.http().post('/api/auth/guest').send({ nickname: 'ghost' }).expect(201);
    await ctx.pool.query('DELETE FROM players');
    await ctx.http().get('/api/levels').set('Authorization', `Bearer ${res.body.token}`).expect(401);
  });
});
