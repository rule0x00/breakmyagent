import { createTestApp, newPlayer, resetState, TestContext } from './support/app';

describe('stats', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(() => ctx.close());
  beforeEach(() => resetState(ctx));

  async function seed() {
    const a = await newPlayer(ctx);
    await newPlayer(ctx);
    const rows: [number, string[] | null, string | null, boolean][] = [
      [1, ['direct_ask'], null, true],
      [1, ['direct_ask', 'roleplay_persona'], null, false],
      [3, ['encoding_obfuscation'], 'output_filter', false],
      [3, ['encoding_obfuscation'], null, true],
      [4, ['roleplay_persona'], 'input_guard', false],
      [5, ['indirect_injection', 'tool_abuse'], 'egress_filter', false],
      [5, null, 'input_guard', false], // not classified yet
    ];
    for (const [level, techniques, blockedBy, leaked] of rows) {
      await ctx.pool.query(
        'INSERT INTO attempts (player_id, level, message, techniques, blocked_by, leaked) VALUES ($1, $2, $3, $4, $5, $6)',
        [a.id, level, 'private prompt', techniques, blockedBy, leaked],
      );
    }
    await ctx.pool.query('INSERT INTO level_clears (player_id, level, attempts_used) VALUES ($1, 1, 2)', [a.id]);
  }

  it('overview: totals and per-level attempts, leaks, clears', async () => {
    await seed();
    const res = await ctx.http().get('/api/stats/overview').expect(200);
    expect(res.body).toMatchObject({ attempts: 7, players: 2, leaks: 2 });
    expect(res.body.levels).toEqual([
      { level: 1, attempts: 2, leaks: 1, clears: 1, leakRate: 0.5 },
      { level: 2, attempts: 0, leaks: 0, clears: 0, leakRate: 0 },
      { level: 3, attempts: 2, leaks: 1, clears: 0, leakRate: 0.5 },
      { level: 4, attempts: 1, leaks: 0, clears: 0, leakRate: 0 },
      { level: 5, attempts: 2, leaks: 0, clears: 0, leakRate: 0 },
    ]);
  });

  it('techniques: every taxonomy entry, multi-label counted per technique, with per-level leak rate', async () => {
    await seed();
    const res = await ctx.http().get('/api/stats/techniques').expect(200);
    expect(res.body).toHaveLength(12);
    const by = Object.fromEntries(res.body.map((t: { technique: string }) => [t.technique, t]));
    expect(by.direct_ask).toMatchObject({ attempts: 2, leaks: 1, leakRate: 0.5 });
    expect(by.roleplay_persona).toMatchObject({ attempts: 2, leaks: 0 });
    expect(by.encoding_obfuscation.perLevel[2]).toEqual({ level: 3, attempts: 2, leaks: 1, leakRate: 0.5 });
    expect(by.language_switch).toMatchObject({ attempts: 0, leakRate: 0 });
  });

  it('defenses: how often each fired, per level', async () => {
    await seed();
    const res = await ctx.http().get('/api/stats/defenses').expect(200);
    expect(res.body.map((d: { defense: string; blocked: number }) => [d.defense, d.blocked])).toEqual([
      ['input_guard', 2],
      ['output_filter', 1],
      ['egress_filter', 1],
    ]);
    expect(res.body[0].perLevel.map((l: { blocked: number }) => l.blocked)).toEqual([0, 0, 0, 1, 1]);
  });

  it('never exposes prompt text and needs no auth', async () => {
    await seed();
    for (const path of ['overview', 'techniques', 'defenses']) {
      const res = await ctx.http().get(`/api/stats/${path}`).expect(200);
      expect(JSON.stringify(res.body)).not.toContain('private prompt');
    }
  });
});
