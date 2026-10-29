import { signJwt, verifyJwt } from '../src/auth/jwt';

describe('jwt', () => {
  const secret = 'a-test-secret-of-decent-length';

  it('round-trips claims', () => {
    const token = signJwt({ sub: 'p1', nick: 'neo' }, secret, 60);
    expect(verifyJwt(token, secret)).toMatchObject({ sub: 'p1', nick: 'neo' });
  });

  it('rejects a wrong key, a tampered payload and an expired token', () => {
    const token = signJwt({ sub: 'p1', nick: 'neo' }, secret, 60);
    expect(verifyJwt(token, 'another-secret-entirely')).toBeNull();
    const [h, , s] = token.split('.');
    const evil = Buffer.from(JSON.stringify({ sub: 'p2', nick: 'x', iat: 0, exp: 9e9 })).toString('base64url');
    expect(verifyJwt(`${h}.${evil}.${s}`, secret)).toBeNull();
    expect(verifyJwt(token, secret, Date.now() + 61_000)).toBeNull();
  });

  it('rejects alg=none style headers', () => {
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 'p1', nick: 'n', iat: 0, exp: 9e9 })).toString('base64url');
    expect(verifyJwt(`${none}.${body}.`, secret)).toBeNull();
  });
});
