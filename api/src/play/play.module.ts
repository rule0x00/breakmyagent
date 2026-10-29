import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LevelsModule } from '../levels/levels.module';
import { RateLimitModule } from '../ratelimit/ratelimit.module';
import { ClassifyQueue } from '../classify/classify.queue';
import { AGENT_CLIENT, HttpAgentClient } from './agent.client';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';

@Module({
  imports: [AuthModule, LevelsModule, RateLimitModule],
  controllers: [PlayController],
  providers: [PlayService, ClassifyQueue, { provide: AGENT_CLIENT, useClass: HttpAgentClient }],
  exports: [PlayService, ClassifyQueue, AGENT_CLIENT],
})
export class PlayModule {}
