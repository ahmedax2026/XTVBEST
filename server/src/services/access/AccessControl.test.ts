import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { accessApi } from '../../api/accessApi.ts';
import { createTunarrBasicAuthHook } from '../../util/basicAuth.ts';
import { AccessControl, createLicenseHook } from './AccessControl.ts';
const owner = { username: 'owner', password: 'owner-secret' };
const auth = (username: string, password: string) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xbest-access-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await fs.rm(dir, { force: true, recursive: true });
});
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const issuer = () =>
  AccessControl.open({
    directory: path.join(dir, 'issuer'),
    owner,
    issuer: true,
  });
async function pair() {
  const authority = await issuer();
  const key = path.join(dir, 'public.pem');
  await fs.writeFile(key, authority.issuerPublicKey() ?? '');
  const options = {
    directory: path.join(dir, 'customer'),
    owner,
    publicKeyFile: key,
    licenseServer: 'https://issuer.example',
  };
  const customer = await AccessControl.open(options);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      const valid = url.pathname.endsWith('/login')
        ? await authority.verifyCustomerLogin(body.token, body.authorization)
        : authority.verifyIssued(body.token);
      return new Response(JSON.stringify({ valid }), { status: 200 });
    }),
  );
  return { authority, customer, options };
}
test('users are hashed, persisted, authenticated, disabled and deleted; owner cannot be replaced', async () => {
  const service = await issuer();
  await service.addUser({
    username: 'operator',
    password: 'long-operator-password',
  });
  expect(
    await service.authenticate(auth('operator', 'long-operator-password')),
  ).toBe(true);
  expect(await service.authenticate(auth('operator', 'bad'))).toBe(false);
  expect(await service.authenticate('Basic invalid')).toBe(false);
  expect(service.isOwner(auth('operator', 'long-operator-password'))).toBe(
    false,
  );
  expect(
    await fs.readFile(path.join(dir, 'issuer/access/state.json'), 'utf8'),
  ).not.toContain('long-operator-password');
  const reopened = await issuer();
  expect(
    await reopened.authenticate(auth('operator', 'long-operator-password')),
  ).toBe(true);
  await reopened.changeUser('operator', false);
  expect(
    await reopened.authenticate(auth('operator', 'long-operator-password')),
  ).toBe(false);
  await reopened.changeUser('operator', true);
  await reopened.changeUser('operator');
  expect(reopened.users()).toEqual([]);
  await expect(
    service.addUser({ username: 'owner', password: 'twelve-characters' }),
  ).rejects.toThrow();
  await expect(
    service.addUser({ username: 'a:b', password: 'twelve-characters' }),
  ).rejects.toThrow();
});
test('concurrent account changes do not lose writes', async () => {
  const service = await issuer();
  await Promise.all(
    ['one', 'two', 'three'].map((username) =>
      service.addUser({ username, password: 'a-long-password' }),
    ),
  );
  expect(service.users()).toHaveLength(3);
});
test('issuer requires owner and corrupt persisted state fails closed', async () => {
  await expect(
    AccessControl.open({ directory: dir, issuer: true }),
  ).rejects.toThrow('owner');
  await fs.writeFile(path.join(dir, 'access/state.json'), '{}');
  await expect(AccessControl.open({ directory: dir, owner })).rejects.toThrow();
});
test('signed activation binds installation, survives restart, and rejects tampering and another server', async () => {
  const { authority, customer, options } = await pair();
  expect(await customer.licensed()).toBe(false);
  const issued = await authority.issue({
    customer: 'Client',
    installation: customer.installation,
    expiresAt: future(),
  });
  expect(authority.verifyIssued(issued.token)).toBe(true);
  const parts = issued.token.split('.');
  const forged = `${Buffer.from(JSON.stringify({ ...issued.payload, customer: 'forged' })).toString('base64url')}.${parts[1]}`;
  expect(authority.verifyIssued(forged)).toBe(false);
  await expect(customer.activate(forged)).rejects.toThrow();
  await customer.activate(issued.token);
  expect(await customer.licensed()).toBe(true);
  const reopened = await AccessControl.open(options);
  expect(reopened.installation).toBe(customer.installation);
  expect(await reopened.licensed()).toBe(true);
  const other = await AccessControl.open({
    ...options,
    directory: path.join(dir, 'other'),
  });
  await expect(other.activate(issued.token)).rejects.toThrow();
  expect(await fs.readdir(path.join(dir, 'customer/access'))).not.toContain(
    'issuer.private.pem',
  );
});
test('revocation is checked after the bounded cache; outages fail closed, renewal invalidates old token', async () => {
  const { authority, customer } = await pair();
  const issued = await authority.issue({
    customer: 'Client',
    installation: customer.installation,
    expiresAt: future(),
  });
  await customer.activate(issued.token);
  expect(await customer.licensed()).toBe(true);
  await authority.changeLicense(issued.payload.id, false);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
  expect(await customer.licensed()).toBe(false);
  const renewed = await authority.changeLicense(
    issued.payload.id,
    true,
    future(),
  );
  expect(authority.verifyIssued(issued.token)).toBe(false);
  expect(authority.verifyIssued(renewed.token)).toBe(true);
  await customer.activate(renewed.token);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect(await customer.licensed()).toBe(false);
  vi.restoreAllMocks();
});
test('expired licenses are rejected and customer cannot sign', async () => {
  const { authority, customer } = await pair();
  const issued = await authority.issue({
    customer: 'Client',
    installation: customer.installation,
    expiresAt: future(),
  });
  const time = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(time + 2 * 86_400_000);
  expect(authority.verifyIssued(issued.token)).toBe(false);
  await expect(customer.activate(issued.token)).rejects.toThrow('expired');
  await expect(
    customer.issue({
      customer: 'Client',
      installation: customer.installation,
      expiresAt: future(),
    }),
  ).rejects.toThrow();
  vi.restoreAllMocks();
});
test('HTTP endpoints require owner, separate operator access, validate inputs, and block browser cross-origin writes', async () => {
  const service = await issuer();
  await service.addUser({
    username: 'operator',
    password: 'long-operator-password',
  });
  const app = Fastify()
    .setValidatorCompiler(validatorCompiler)
    .setSerializerCompiler(serializerCompiler);
  app.addHook(
    'onRequest',
    createTunarrBasicAuthHook(owner, (header) => service.authenticate(header)),
  );
  await app.register(accessApi(service), { prefix: '/api/access' });
  app.get('/protected', async () => 'ok');
  const ownerHeaders = { authorization: auth(owner.username, owner.password) };
  const operatorHeaders = {
    authorization: auth('operator', 'long-operator-password'),
  };
  try {
    expect((await app.inject('/api/access/users')).statusCode).toBe(401);
    expect(
      (await app.inject({ url: '/api/access/status' })).json(),
    ).not.toHaveProperty('installation');
    expect(
      (await app.inject({ url: '/protected', headers: operatorHeaders }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/access/users', headers: operatorHeaders }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({ url: '/api/access/users', headers: ownerHeaders })
      ).json(),
    ).toEqual([{ username: 'operator', enabled: true }]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/access/users',
          headers: ownerHeaders,
          payload: { username: 'new', password: 'short' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/access/users',
          headers: { ...ownerHeaders, origin: 'https://evil.example' },
          payload: { username: 'new', password: 'long-new-password' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/access/verify',
          payload: { token: 'forged' },
        })
      ).json(),
    ).toEqual({ valid: false });
    await app.inject({
      method: 'DELETE',
      url: '/api/access/users/operator',
      headers: ownerHeaders,
    });
    expect(
      (await app.inject({ url: '/protected', headers: operatorHeaders }))
        .statusCode,
    ).toBe(401);
  } finally {
    await app.close();
  }
});
test('login attempts are limited per source', async () => {
  const app = Fastify();
  app.addHook('onRequest', createTunarrBasicAuthHook(owner));
  app.get('/protected', async () => 'ok');
  try {
    for (let n = 0; n < 10; n++)
      expect((await app.inject('/protected')).statusCode).toBe(401);
    expect((await app.inject('/protected')).statusCode).toBe(429);
  } finally {
    await app.close();
  }
});

test('license gate blocks new API/stream requests but activation page remains reachable', async () => {
  const { authority, customer } = await pair();
  const app = Fastify()
    .setValidatorCompiler(validatorCompiler)
    .setSerializerCompiler(serializerCompiler);
  app.addHook(
    'onRequest',
    createTunarrBasicAuthHook(owner, (header) => customer.authenticate(header)),
  );
  app.addHook('onRequest', createLicenseHook(customer));
  await app.register(accessApi(customer), { prefix: '/api/access' });
  app.get('/web/settings/access', async () => 'activation page');
  app.get('/api/protected', async () => 'protected');
  app.get(
    '/stream/test.ts',
    { config: { authRequired: false } },
    async () => 'stream',
  );
  const headers = { authorization: auth(owner.username, owner.password) };
  try {
    expect(
      (await app.inject({ url: '/web/settings/access', headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/protected', headers })).statusCode,
    ).toBe(402);
    expect((await app.inject('/stream/test.ts')).statusCode).toBe(402);
    const issued = await authority.issue({
      customer: 'Client',
      installation: customer.installation,
      expiresAt: future(),
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/access/activate',
          headers,
          payload: { token: issued.token },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/protected', headers })).statusCode,
    ).toBe(200);
    expect((await app.inject('/stream/test.ts')).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});

test('central owner creates customer-bound users; accounts cannot cross installations and revocation expires cached login', async () => {
  const { authority, customer, options } = await pair();
  const issued = await authority.issue({
    customer: 'Client',
    installation: customer.installation,
    expiresAt: future(),
  });
  await authority.addUser({
    username: 'remote',
    password: 'remote-long-password',
    installation: customer.installation,
  });
  const header = auth('remote', 'remote-long-password');
  await customer.activate(issued.token);
  expect(await customer.authenticate(header)).toBe(true);
  expect(await authority.authenticate(header)).toBe(false);
  expect(await customer.authenticate(auth('remote', 'incorrect'))).toBe(false);
  const other = await AccessControl.open({
    ...options,
    directory: path.join(dir, 'other'),
  });
  const otherLicense = await authority.issue({
    customer: 'Other',
    installation: other.installation,
    expiresAt: future(),
  });
  await other.activate(otherLicense.token);
  expect(await other.authenticate(header)).toBe(false);
  await authority.changeUser('remote', false);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
  expect(await customer.authenticate(header)).toBe(false);
  await authority.changeUser('remote', true);
  expect(await customer.authenticate(header)).toBe(true);
  await authority.changeUser('remote');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
  expect(await customer.authenticate(header)).toBe(false);
});
