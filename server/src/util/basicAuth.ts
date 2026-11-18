import crypto from 'node:crypto';
import type {
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from 'fastify';
import { getEnvVar, TUNARR_ENV_VARS } from './env.ts';

export interface BasicAuthConfig {
  username: string;
  password: string;
}

export function basicAuthConfigFromEnv(): BasicAuthConfig | undefined {
  const username = getEnvVar(TUNARR_ENV_VARS.BASIC_AUTH_USER_ENV_VAR);
  const password = getEnvVar(TUNARR_ENV_VARS.BASIC_AUTH_PASSWORD_ENV_VAR);
  if (!username && !password) return;
  if (!username || !password) {
    throw new Error(
      'Set both TUNARR_BASIC_AUTH_USER and TUNARR_BASIC_AUTH_PASSWORD. Refusing to start with incomplete login credentials.',
    );
  }
  if (username.includes(':')) {
    throw new Error('The login username cannot contain a colon.');
  }
  return { username, password };
}

function unauthorized(reply: FastifyReply) {
  reply.header(
    'WWW-Authenticate',
    'Basic realm="XBest Channels Studio", charset="UTF-8"',
  );
  return reply.status(401).send('Authentication required');
}

function hash(value: string) {
  return crypto.createHash('sha256').update(value).digest();
}

export function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(hash(a), hash(b));
}

export function validateBasicAuth(
  authHeader: string | undefined,
  expectedUser: string,
  expectedPass: string,
) {
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const encoded = authHeader.slice(6).trim();
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');

    if (idx < 0) {
      return false;
    }

    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);

    const userMatches = safeEqual(user, expectedUser);
    const passMatches = safeEqual(pass, expectedPass);

    return userMatches && passMatches;
  } catch {
    return false;
  }
}

// True when basic auth is off or the header carries valid credentials. Routes
// marked `authRequired: false` use it to hold back private data.
export function isAuthorized(
  authHeader: string | undefined,
  config: BasicAuthConfig | undefined,
) {
  return (
    !config || validateBasicAuth(authHeader, config.username, config.password)
  );
}

export function createTunarrBasicAuthHook(
  config: BasicAuthConfig,
  authenticate?: (header?: string) => Promise<boolean>,
  onUnauthorized?: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => FastifyReply,
): onRequestAsyncHookHandler {
  const failures = new Map<string, { count: number; reset: number }>();
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.routeOptions.config?.authRequired === false) return;
    const now = Date.now();
    const previous = failures.get(request.ip);
    if (previous && previous.reset > now && previous.count >= 10) {
      reply.header('Retry-After', Math.ceil((previous.reset - now) / 1000));
      return reply.code(429).send('Too many login attempts');
    }
    const ok = authenticate
      ? await authenticate(request.headers.authorization)
      : validateBasicAuth(
          request.headers.authorization,
          config.username,
          config.password,
        );
    if (!ok) {
      if (failures.size >= 1000) failures.clear();
      failures.set(
        request.ip,
        previous && previous.reset > now
          ? { ...previous, count: previous.count + 1 }
          : { count: 1, reset: now + 60_000 },
      );
      return onUnauthorized
        ? onUnauthorized(request, reply)
        : unauthorized(reply);
    }
    failures.delete(request.ip);
  };
}
