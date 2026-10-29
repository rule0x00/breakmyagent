import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LevelsModule } from '../levels/levels.module';
import { AGENT_CLIENT, HttpAgentClient } from './agent.client';
import { PlayController } from './play.controller';
import { PlayService } from './play.service';

@Module({
  imports: [AuthModule, LevelsModule],
  controllers: [PlayController],
  providers: [PlayService, { provide: AGENT_CLIENT, useClass: HttpAgentClient }],
})
export class PlayModule {}
