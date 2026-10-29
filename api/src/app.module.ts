import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ClassifyModule } from './classify/classify.module';
import { ConfigModule } from './config/config.module';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { LevelsModule } from './levels/levels.module';
import { PlayModule } from './play/play.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [ConfigModule, DbModule, AuthModule, LevelsModule, PlayModule, ClassifyModule, LeaderboardModule, StatsModule],
  controllers: [HealthController],
})
export class AppModule {}
