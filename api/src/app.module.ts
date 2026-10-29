import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { LevelsModule } from './levels/levels.module';
import { PlayModule } from './play/play.module';

@Module({
  imports: [ConfigModule, DbModule, AuthModule, LevelsModule, PlayModule],
  controllers: [HealthController],
})
export class AppModule {}
