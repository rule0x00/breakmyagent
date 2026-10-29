import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

export const PG_POOL = Symbol('PG_POOL');
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) => new Pool({ connectionString: env.DATABASE_URL, max: 10 }),
    },
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 }),
    },
  ],
  exports: [PG_POOL, REDIS],
})
export class DbModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
