import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DatabaseError, Pool } from 'pg';
import { hashIp } from '../common/crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PG_POOL } from '../db/db.module';
import { signJwt } from './jwt';
import type { Player } from './player';

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async createGuest(nickname: string, ip: string | undefined): Promise<{ token: string; player: Player }> {
    try {
      const { rows } = await this.pool.query<Player>(
        'INSERT INTO players (nickname, ip_hash) VALUES ($1, $2) RETURNING id, nickname',
        [nickname, hashIp(ip, this.env.IP_HASH_SALT)],
      );
      const player = rows[0];
      const token = signJwt({ sub: player.id, nick: player.nickname }, this.env.JWT_SECRET, TOKEN_TTL_SECONDS);
      return { token, player };
    } catch (err) {
      if (err instanceof DatabaseError && err.code === '23505') {
        throw new ConflictException('Nickname is taken');
      }
      throw err;
    }
  }
}
