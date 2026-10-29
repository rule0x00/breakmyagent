import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { ENV } from '../../src/config/config.module';
import { loadEnv } from '../../src/config/env';
import { PG_POOL, REDIS } from '../../src/db/db.module';
import { AGENT_CLIENT, AgentChatRequest, AgentChatResponse, AgentClient } from '../../src/play/agent.client';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './test-env';

export class FakeAgent implements AgentClient {
  requests: { level: number; body: AgentChatRequest }[] = [];
  next: Partial<AgentChatResponse> | Error = {};

  async chat(level: number, body: AgentChatRequest): Promise<AgentChatResponse> {
    this.requests.push({ level, body });
    if (this.next instanceof Error) throw this.next;
    return {
      reply: "I can't share that.",
      toolCalls: [],
      blockedBy: null,
      usage: { inputTokens: 100, outputTokens: 20 },
      latencyMs: 5,
      ...this.next,
    };
  }
}

export interface TestContext {
  app: INestApplication;
  pool: Pool;
  redis: Redis;
  agent: FakeAgent;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export const TEST_ENV = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: TEST_REDIS_URL,
  JWT_SECRET: 'test-jwt-secret-0123456789',
  IP_HASH_SALT: 'test-salt',
});

export async function createTestApp(envOverrides: Partial<typeof TEST_ENV> = {}): Promise<TestContext> {
  const agent = new FakeAgent();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue({ ...TEST_ENV, ...envOverrides })
    .overrideProvider(AGENT_CLIENT)
    .useValue(agent)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const pool = app.get<Pool>(PG_POOL);
  const redis = app.get<Redis>(REDIS);
  return {
    app,
    pool,
    redis,
    agent,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}

export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.pool.query('TRUNCATE attempts, level_clears, level_secrets, players CASCADE');
  await ctx.redis.flushdb();
  ctx.agent.requests = [];
  ctx.agent.next = {};
}

let counter = 0;

/** Creates a guest player and returns its bearer token + id. */
export async function newPlayer(ctx: TestContext, nickname = `player_${++counter}`): Promise<{ token: string; id: string }> {
  const res = await ctx.http().post('/api/auth/guest').send({ nickname }).expect(201);
  return { token: res.body.token, id: res.body.player.id };
}

export async function secretFor(ctx: TestContext, playerId: string, level: number): Promise<string> {
  const secret = await ctx.redis.get(`secret:${playerId}:${level}`);
  if (!secret) throw new Error(`no secret for ${playerId}/${level}`);
  return secret;
}

/** Opens + clears levels 1..upTo for the player via the public API. */
export async function clearLevels(ctx: TestContext, p: { token: string; id: string }, upTo: number): Promise<void> {
  for (let n = 1; n <= upTo; n++) {
    await ctx.http().get(`/api/levels/${n}`).set('Authorization', `Bearer ${p.token}`).expect(200);
    const secret = await secretFor(ctx, p.id, n);
    await ctx.http().post(`/api/levels/${n}/submit`).set('Authorization', `Bearer ${p.token}`).send({ secret }).expect(200);
  }
}
