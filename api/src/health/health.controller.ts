import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { PG_POOL, REDIS } from '../db/db.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'ok'; redis: 'ok' }> {
    const [db, redis] = await Promise.allSettled([this.pool.query('SELECT 1'), this.redis.ping()]);
    if (db.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'error',
        db: db.status === 'fulfilled' ? 'ok' : 'down',
        redis: redis.status === 'fulfilled' ? 'ok' : 'down',
      });
    }
    return { status: 'ok', db: 'ok', redis: 'ok' };
  }
}
