import { Module } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { RateLimitService } from './ratelimit.service';

@Module({
  providers: [RateLimitService, BudgetService],
  exports: [RateLimitService, BudgetService],
})
export class RateLimitModule {}
