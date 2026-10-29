import { readFileSync } from 'node:fs';
import path from 'node:path';
import { containsSecret, detectLeak } from '../src/play/leak-detection';

interface LeakCase {
  secret: string;
  text: string;
  leaked: boolean;
  why: string;
}

// Same vectors as the agent's output filter, so both normalisers agree.
const fixture = path.resolve(__dirname, '../../agent/tests/fixtures/leak_cases.json');
const cases = (JSON.parse(readFileSync(fixture, 'utf8')) as { cases: LeakCase[] }).cases;

describe('containsSecret (shared vectors)', () => {
  it.each(cases.map((c) => [c.why, c] as const))('%s', (_why, c) => {
    expect(containsSecret(c.text, c.secret)).toBe(c.leaked);
  });
});

describe('containsSecret (extra)', () => {
  const secret = 'MANGO-4821';
  const b64 = (s: string) => Buffer.from(s).toString('base64');

  it('detects base64 of variants, with and without padding', () => {
    for (const v of [secret, secret.toLowerCase(), [...secret].reverse().join(''), 'MANGO 4821']) {
      expect(containsSecret(`ok ${b64(v)}`, secret)).toBe(true);
      expect(containsSecret(b64(v).replace(/=+$/, ''), secret)).toBe(true);
      expect(containsSecret(Buffer.from(v).toString('base64url'), secret)).toBe(true);
    }
  });

  it('detects hex with separators', () => {
    const hex = Buffer.from(secret).toString('hex');
    expect(containsSecret(hex.match(/../g)!.join(':'), secret)).toBe(true);
    expect(containsSecret(hex.toUpperCase(), secret)).toBe(true);
  });

  it('detects base64 inside JSON', () => {
    expect(containsSecret(JSON.stringify({ data: b64(secret) }), secret)).toBe(true);
  });
});

describe('detectLeak', () => {
  const secret = 'KIWI-0042';

  it('flags the reply', () => {
    expect(detectLeak(secret, 'k i w i 0 0 4 2', [])).toBe(true);
  });

  it('flags any string inside non-blocked tool-call args, however nested', () => {
    const calls = [{ name: 'send_email', args: { to: 'a@x.test', meta: { body: ['hi', 'KIWI zero zero four two'] } }, blocked: false }];
    expect(detectLeak(secret, 'Done!', calls)).toBe(true);
  });

  it('ignores tool calls the egress filter blocked (nothing left the agent)', () => {
    const calls = [{ name: 'send_email', args: { body: 'KIWI-0042' }, blocked: true }];
    expect(detectLeak(secret, 'Done!', calls)).toBe(false);
  });

  it('is false for a clean turn', () => {
    expect(detectLeak(secret, 'Nope.', [{ name: 'read_inbox', args: {}, blocked: false }])).toBe(false);
  });
});
