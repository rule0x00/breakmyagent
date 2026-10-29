import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface Player {
  id: string;
  nickname: string;
}

export type AuthedRequest = Request & { player: Player };

export const CurrentPlayer = createParamDecorator((_data: unknown, ctx: ExecutionContext): Player => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().player;
});
