import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PG_POOL, REDIS } from '../src/db/db.module';
import { HealthController } from '../src/health/health.controller';

async function makeApp(pool: object, redis: object): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PG_POOL, useValue: pool },
      { provide: REDIS, useValue: redis },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('GET /health', () => {
  it('returns ok when postgres and redis respond', async () => {
    const app = await makeApp(
      { query: jest.fn().mockResolvedValue({ rows: [] }) },
      { ping: jest.fn().mockResolvedValue('PONG') },
    );
    await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok', db: 'ok', redis: 'ok' });
    await app.close();
  });

  it('returns 503 when a dependency is down', async () => {
    const app = await makeApp(
      { query: jest.fn().mockResolvedValue({ rows: [] }) },
      { ping: jest.fn().mockRejectedValue(new Error('down')) },
    );
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ db: 'ok', redis: 'down' });
    await app.close();
  });
});
