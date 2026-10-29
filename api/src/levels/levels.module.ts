import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../ratelimit/ratelimit.module';
import { LevelsController } from './levels.controller';
import { LevelsService } from './levels.service';

@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [LevelsController],
  providers: [LevelsService],
  exports: [LevelsService],
})
export class LevelsModule {}
