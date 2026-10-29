import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentPlayer, type Player } from '../auth/player';
import { ZodPipe } from '../common/zod.pipe';
import { LevelsService } from './levels.service';

const submitSchema = z.object({ secret: z.string().min(1).max(100) });

@Controller('levels')
@UseGuards(JwtGuard)
export class LevelsController {
  constructor(private readonly levels: LevelsService) {}

  @Get()
  list(@CurrentPlayer() player: Player) {
    return this.levels.list(player.id);
  }

  @Get(':n')
  open(@CurrentPlayer() player: Player, @Param('n', ParseIntPipe) n: number) {
    return this.levels.open(player.id, n);
  }

  @Post(':n/submit')
  @HttpCode(200)
  submit(
    @CurrentPlayer() player: Player,
    @Param('n', ParseIntPipe) n: number,
    @Body(new ZodPipe(submitSchema)) body: z.infer<typeof submitSchema>,
  ) {
    return this.levels.submit(player.id, n, body.secret);
  }

  @Delete(':n/history')
  @HttpCode(204)
  async resetHistory(@CurrentPlayer() player: Player, @Param('n', ParseIntPipe) n: number): Promise<void> {
    await this.levels.assertPlayable(player.id, n);
    await this.levels.resetHistory(player.id, n);
  }
}
