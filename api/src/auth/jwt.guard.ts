import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PG_POOL } from '../db/db.module';
import { verifyJwt } from './jwt';
import type { AuthedRequest, Player } from './player';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const payload = scheme === 'Bearer' && token ? verifyJwt(token, this.env.JWT_SECRET) : null;
    if (!payload) throw new UnauthorizedException('Missing or invalid token');

    // Also catches tokens for players removed since (e.g. a DB reset).
    const { rows } = await this.pool.query<Player>('SELECT id, nickname FROM players WHERE id = $1', [payload.sub]);
    if (!rows[0]) throw new UnauthorizedException('Unknown player');
    req.player = rows[0];
    return true;
  }
}
