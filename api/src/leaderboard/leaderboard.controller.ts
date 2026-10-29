import { Controller, Get } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  top() {
    return this.leaderboard.top();
  }

  @Get('feed')
  feed() {
    return this.leaderboard.recent();
  }
}
