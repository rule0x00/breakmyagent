import { Controller, Get } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview() {
    return this.stats.overview();
  }

  @Get('techniques')
  techniques() {
    return this.stats.techniques();
  }

  @Get('defenses')
  defenses() {
    return this.stats.defenses();
  }
}
