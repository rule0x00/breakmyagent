import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal HS256 JWT (sign + verify) on node:crypto, to stay within the agreed stack.

export interface JwtPayload {
  sub: string;
  nick: string;
  iat: number;
  exp: number;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signJwt(claims: { sub: string; nick: string }, secret: string, ttlSeconds: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload: JwtPayload = { ...claims, iat, exp: iat + ttlSeconds };
  const body = `${HEADER}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${sign(body, secret)}`;
}

export function verifyJwt(token: string, secret: string, now = Date.now()): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, secret));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    return payload.exp * 1000 > now ? payload : null;
  } catch {
    return null;
  }
}
