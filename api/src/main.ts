import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableCors({ origin: env.CORS_ORIGIN });
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, '0.0.0.0');
}

void bootstrap();
