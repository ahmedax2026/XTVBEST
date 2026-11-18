import { accessApi } from '../../api/accessApi.ts';
import Fastify from 'fastify';
import {
  validatorCompiler,
  serializerCompiler,
} from 'fastify-type-provider-zod';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { StudioWebLogin } from './StudioWebLogin.ts';
import { AccessControl } from './AccessControl.ts';
import { createTunarrBasicAuthHook } from '../../util/basicAuth.ts';

test('branded browser login uses opaque cookies, validates accounts per request, and logs out', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-login-'));
  const owner = { username: 'owner', password: 'owner-password' };
  const access = await AccessControl.open({ directory, owner });
  await access.addUser({ username: 'operator', password: 'operator-password' });
  const app = Fastify()
    .setValidatorCompiler(validatorCompiler)
    .setSerializerCompiler(serializerCompiler);
  const login = new StudioWebLogin(access);
  app.addHook('onRequest', (req, _reply, done) => {
    login.restore(req);
    done();
  });
  app.addHook(
    'onRequest',
    createTunarrBasicAuthHook(
      owner,
      (header) => access.authenticate(header),
      (req, reply) => login.unauthorized(req, reply),
    ),
  );
  await app.register(login.router);
  await app.register(accessApi(access), { prefix: '/api/access' });
  app.get('/web/*', async () => 'studio');
  app.get('/api/private', async () => 'private');
  try {
    const page = await app.inject({
      url: '/web/',
      headers: { accept: 'text/html' },
    });
    expect(page.statusCode).toBe(401);
    expect(page.headers['www-authenticate']).toBeUndefined();
    expect(page.headers['content-security-policy']).toContain('nonce-');
    expect(page.body).toContain('XBEST CHANNELS STUDIO');
    expect(page.body).not.toMatch(/Tunarr/);
    if (process.env.XBEST_CAPTURE_LOGIN === '1') {
      const output = path.resolve('../web/test-results/studio');
      await fs.mkdir(output, { recursive: true });
      await fs.writeFile(path.join(output, 'login-ar.html'), page.body);
      const english = await app.inject({
        url: '/web/?lang=en',
        headers: { accept: 'text/html' },
      });
      await fs.writeFile(path.join(output, 'login-en.html'), english.body);
    }
    expect(
      (await app.inject('/api/private')).headers['www-authenticate'],
    ).toContain('Basic');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/session',
          payload: { username: 'operator', password: 'bad' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/session',
          headers: { origin: 'https://evil.example' },
          payload: { username: 'operator', password: 'operator-password' },
        })
      ).statusCode,
    ).toBe(403);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/session',
      payload: { username: 'operator', password: 'operator-password' },
    });
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).not.toContain('operator');
    const cookie = setCookie.split(';')[0];
    expect(
      (await app.inject({ url: '/api/private', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/access/users', headers: { cookie } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/api/private',
          headers: { cookie, origin: 'https://evil.example' },
        })
      ).statusCode,
    ).toBe(401);
    await access.changeUser('operator', false);
    expect(
      (await app.inject({ url: '/api/private', headers: { cookie } }))
        .statusCode,
    ).toBe(401);
    await access.changeUser('operator', true);
    expect(
      (await app.inject({ url: '/api/private', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/logout',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/private', headers: { cookie } }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: '/web/',
          headers: { cookie, accept: 'text/html' },
        })
      ).body,
    ).toContain('أهلًا بعودتك');
    expect(
      (
        await app.inject({
          url: '/web/?lang=en',
          headers: { accept: 'text/html' },
        })
      ).body,
    ).toContain('Welcome back');
  } finally {
    await app.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
