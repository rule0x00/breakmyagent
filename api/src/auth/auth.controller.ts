import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { GuestBody, guestSchema } from './nickname';
import { CurrentPlayer, type Player } from './player';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('guest')
  guest(@Body(new ZodPipe(guestSchema)) body: GuestBody, @Req() req: Request) {
    return this.auth.createGuest(body.nickname, req.ip);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentPlayer() player: Player): Player {
    return player;
  }
}
