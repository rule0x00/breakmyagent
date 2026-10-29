import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get<Env>(ENV).API_PORT, '0.0.0.0');
}

void bootstrap();
