import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PlayModule } from '../play/play.module';
import { RateLimitModule } from '../ratelimit/ratelimit.module';
import { ClassifyProcessor } from './classify.processor';

@Module({
  imports: [PlayModule, RateLimitModule, LeaderboardModule],
  providers: [ClassifyProcessor],
})
export class ClassifyModule {}
