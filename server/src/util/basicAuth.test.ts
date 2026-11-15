import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  basicAuthConfigFromEnv,
  createTunarrBasicAuthHook,
  isAuthorized,
  safeEqual,
  validateBasicAuth,
} from './basicAuth.ts';

function basicAuthHeader(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function createRequest(
  authorization?: string,
  authRequired?: boolean,
): FastifyRequest {
  return {
    headers: {
      authorization,
    },
    routeOptions: {
      config: authRequired === undefined ? {} : { authRequired },
    },
  } as unknown as FastifyRequest;
}

type MockReply = FastifyReply & {
  header: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};

function createReply(): MockReply {
  const reply = {} as MockReply;

  reply.header = vi.fn(() => reply);
  reply.status = vi.fn(() => reply);
  reply.send = vi.fn(() => reply);

  return reply;
}

describe('basicAuth', () => {
  describe('safeEqual', () => {
    test('returns true for matching strings', () => {
      expect(safeEqual('tunarr', 'tunarr')).toBe(true);
    });

    test('returns false for non-matching strings with different lengths', () => {
      expect(safeEqual('tunarr', 'tunarr-password')).toBe(false);
    });
  });

  describe('validateBasicAuth', () => {
    test('returns false when the authorization header is missing', () => {
      expect(validateBasicAuth(undefined, 'user', 'pass')).toBe(false);
    });

    test('returns false when the authorization header is not basic auth', () => {
      expect(validateBasicAuth('Bearer token', 'user', 'pass')).toBe(false);
    });

    test('returns false when the credentials are malformed', () => {
      expect(validateBasicAuth('Basic bm9jb2xvbg==', 'user', 'pass')).toBe(
        false,
      );
    });

    test('returns false when the credentials do not match', () => {
      expect(
        validateBasicAuth(basicAuthHeader('wrong', 'creds'), 'user', 'pass'),
      ).toBe(false);
    });

    test('returns true when the credentials match', () => {
      expect(
        validateBasicAuth(basicAuthHeader('user', 'pass'), 'user', 'pass'),
      ).toBe(true);
    });
  });

  describe('createTunarrBasicAuthHook', () => {
    test('skips auth when route config marks authRequired false', () => {
      const hook = createTunarrBasicAuthHook({
        username: 'user',
        password: 'pass',
      });
      const reply = createReply();
      const done = vi.fn();

      hook(createRequest(undefined, false), reply, done);

      expect(done).toHaveBeenCalledOnce();
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    test('rejects protected routes when credentials are missing', () => {
      const hook = createTunarrBasicAuthHook({
        username: 'user',
        password: 'pass',
      });
      const reply = createReply();
      const done = vi.fn();

      hook(createRequest(), reply, done);

      expect(done).not.toHaveBeenCalled();
      expect(reply.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Basic realm="XBest Channels Studio", charset="UTF-8"',
      );
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith('Authentication required');
    });

    test('rejects protected routes when credentials are invalid', () => {
      const hook = createTunarrBasicAuthHook({
        username: 'user',
        password: 'pass',
      });
      const reply = createReply();
      const done = vi.fn();

      hook(createRequest(basicAuthHeader('user', 'wrong')), reply, done);

      expect(done).not.toHaveBeenCalled();
      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith('Authentication required');
    });

    test('allows protected routes when credentials are valid', () => {
      const hook = createTunarrBasicAuthHook({
        username: 'user',
        password: 'pass',
      });
      const reply = createReply();
      const done = vi.fn();

      hook(createRequest(basicAuthHeader('user', 'pass')), reply, done);

      expect(done).toHaveBeenCalledOnce();
      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });
});

describe('isAuthorized', () => {
  const config = { username: 'admin', password: 'secret' };

  test('allows any request when basic auth is off', () => {
    expect(isAuthorized(undefined, undefined)).toBe(true);
  });

  test('allows a request with valid credentials', () => {
    expect(isAuthorized(basicAuthHeader('admin', 'secret'), config)).toBe(true);
  });

  test('rejects a request with missing or wrong credentials', () => {
    expect(isAuthorized(undefined, config)).toBe(false);
    expect(isAuthorized(basicAuthHeader('admin', 'wrong'), config)).toBe(false);
  });
});

describe('login environment configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  test('keeps authentication disabled only when both variables are absent', () => {
    vi.stubEnv('TUNARR_BASIC_AUTH_USER', '');
    vi.stubEnv('TUNARR_BASIC_AUTH_PASSWORD', '');
    expect(basicAuthConfigFromEnv()).toBeUndefined();
  });

  test.each([
    ['admin', ''],
    ['', 'secret'],
  ])('refuses incomplete credentials', (user, password) => {
    vi.stubEnv('TUNARR_BASIC_AUTH_USER', user);
    vi.stubEnv('TUNARR_BASIC_AUTH_PASSWORD', password);
    expect(() => basicAuthConfigFromEnv()).toThrow('Set both');
  });

  test('reads complete credentials without changing the password', () => {
    vi.stubEnv('TUNARR_BASIC_AUTH_USER', 'admin');
    vi.stubEnv('TUNARR_BASIC_AUTH_PASSWORD', 'secret:with:colons');
    expect(basicAuthConfigFromEnv()).toEqual({
      username: 'admin',
      password: 'secret:with:colons',
    });
  });

  test('refuses usernames containing the Basic Auth separator', () => {
    vi.stubEnv('TUNARR_BASIC_AUTH_USER', 'admin:other');
    vi.stubEnv('TUNARR_BASIC_AUTH_PASSWORD', 'secret');
    expect(() => basicAuthConfigFromEnv()).toThrow('colon');
  });
});

test('server rejects direct panel/API requests but allows valid login and public playback', async () => {
  const app = Fastify();
  app.addHook(
    'onRequest',
    createTunarrBasicAuthHook({ username: 'admin', password: 'secret' }),
  );
  app.get('/web', async () => 'panel');
  app.get('/api/settings', async () => ({ protected: true }));
  app.get(
    '/stream/channel.m3u8',
    { config: { authRequired: false } },
    async () => '#EXTM3U',
  );
  try {
    expect((await app.inject('/web')).statusCode).toBe(401);
    expect((await app.inject('/api/settings')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/settings',
          headers: { authorization: basicAuthHeader('admin', 'wrong') },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/settings',
          headers: { authorization: basicAuthHeader('admin', 'secret') },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject('/stream/channel.m3u8')).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
