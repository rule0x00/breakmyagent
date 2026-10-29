import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { LiveIoAdapter } from './leaderboard/live.adapter';
import { RateLimitFilter } from './ratelimit/ratelimit.filter';

/** Shared by main.ts and the integration tests so both run the same app. */
export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableCors({ origin: env.CORS_ORIGIN, exposedHeaders: ['Retry-After'] });
  app.useGlobalFilters(new RateLimitFilter());
  app.useWebSocketAdapter(new LiveIoAdapter(app, env.CORS_ORIGIN));
  // Honour X-Forwarded-For only from private networks (a reverse proxy in front of us).
  (app as NestExpressApplication).set('trust proxy', 'loopback, linklocal, uniquelocal');
}
