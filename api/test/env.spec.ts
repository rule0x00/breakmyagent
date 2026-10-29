import { loadEnv } from '../src/config/env';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'x'.repeat(32),
  IP_HASH_SALT: 'salty-salt',
};

describe('loadEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = loadEnv({ ...base, DAILY_BUDGET_USD: '2.5' });
    expect(env.DAILY_BUDGET_USD).toBe(2.5);
    expect(env.RATE_LIMIT_PER_MIN).toBe(10);
  });

  it('rejects a missing JWT_SECRET', () => {
    const { JWT_SECRET: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/JWT_SECRET/);
  });
});
