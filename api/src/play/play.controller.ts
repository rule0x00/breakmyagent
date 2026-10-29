import { BadRequestException, Body, Controller, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentPlayer, type Player } from '../auth/player';
import { ZodPipe } from '../common/zod.pipe';
import { PlayService } from './play.service';

const INBOX_LEVEL = 5;

const attemptSchema = z.object({
  message: z.string().min(1).max(1000),
  inboxEmail: z.string().min(1).max(1500).optional(),
});

@Controller('levels')
@UseGuards(JwtGuard)
export class PlayController {
  constructor(private readonly play: PlayService) {}

  @Post(':n/attempts')
  @HttpCode(200)
  attempt(
    @CurrentPlayer() player: Player,
    @Param('n', ParseIntPipe) n: number,
    @Body(new ZodPipe(attemptSchema)) body: z.infer<typeof attemptSchema>,
  ) {
    if (body.inboxEmail !== undefined && n !== INBOX_LEVEL) {
      throw new BadRequestException('inboxEmail is only allowed on level 5');
    }
    return this.play.attempt(player.id, n, body);
  }
}
