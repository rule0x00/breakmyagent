import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** IPs are never stored raw: SHA-256 with a server-side salt. */
export function hashIp(ip: string | undefined, salt: string): string | null {
  return ip ? sha256Hex(`${salt}:${ip}`) : null;
}

export function hexEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
