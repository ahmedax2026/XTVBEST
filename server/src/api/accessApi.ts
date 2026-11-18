import { z } from 'zod/v4';
import {
  LicenseInput,
  UserInput,
  UserUpdate,
} from '../services/access/AccessControl.ts';
import type { AccessControl } from '../services/access/AccessControl.ts';
import type { RouterPluginAsyncCallback } from '../types/serverType.js';

export const accessApi =
  (access: AccessControl): RouterPluginAsyncCallback =>
  (app) => {
    // Customer activation/status work even before a license is installed. Account
    // and issuer mutations still require the owner credentials on every request.
    app.addHook('onRequest', async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (
        req.routeOptions.url === '/api/access/verify' ||
        req.routeOptions.url === '/api/access/login' ||
        req.routeOptions.url === '/api/access/status'
      )
        return;
      if (!access.isOwner(req.headers.authorization))
        return reply.code(403).send({ error: 'Owner login required' });
      if (req.method !== 'GET' && req.headers.origin) {
        // Block cross-origin browser writes even if a deployment enables CORS.
        let origin: URL;
        try {
          origin = new URL(req.headers.origin);
        } catch {
          return reply.code(403).send({ error: 'Invalid origin' });
        }
        if (origin.host !== req.headers.host)
          return reply
            .code(403)
            .send({ error: 'Same-origin request required' });
      }
    });
    app.setErrorHandler((error, _req, reply) => {
      if (error.validation)
        return reply.code(400).send({ error: 'Invalid request' });
      return reply.code(400).send({
        error:
          error instanceof Error ? error.message : 'Access operation failed',
      });
    });
    app.get('/status', { config: { authRequired: false } }, async (req) => ({
      ...(access.isOwner(req.headers.authorization)
        ? access.status()
        : { configured: access.status().configured }),
      owner: access.isOwner(req.headers.authorization),
      valid: await access.licensed(),
    }));
    app.get('/users', (_req, reply) => reply.send(access.users()));
    app.post('/users', { schema: { body: UserInput } }, async (req) => {
      await access.addUser(req.body);
      return { ok: true };
    });
    const userParams = z.object({ username: UserInput.shape.username });
    app.patch(
      '/users/:username',
      {
        schema: {
          params: userParams,
          body: UserUpdate,
        },
      },
      async (req) => {
        await access.updateUser(req.params.username, req.body);
        return { ok: true };
      },
    );
    app.delete(
      '/users/:username',
      { schema: { params: userParams } },
      async (req) => {
        await access.changeUser(req.params.username);
        return { ok: true };
      },
    );
    app.get('/licenses', (_req, reply) => reply.send(access.licenses()));
    app.get('/audit', (_req, reply) => reply.send(access.audit()));
    app.get(
      '/licenses/:id/code',
      { schema: { params: z.object({ id: z.uuid() }) } },
      (req) => access.licenseCode(req.params.id),
    );
    app.get('/public-key', (_req, reply) =>
      reply.send({ publicKey: access.issuerPublicKey() ?? null }),
    );
    app.post('/licenses', { schema: { body: LicenseInput } }, async (req) =>
      access.issue(req.body),
    );
    app.patch(
      '/licenses/:id',
      {
        schema: {
          params: z.object({ id: z.uuid() }),
          body: z.object({
            enabled: z.boolean(),
            expiresAt: z.iso.datetime().optional(),
          }),
        },
      },
      async (req) =>
        access.changeLicense(
          req.params.id,
          req.body.enabled,
          req.body.expiresAt,
        ),
    );
    app.post(
      '/activate',
      { schema: { body: z.object({ token: z.string().min(1).max(8192) }) } },
      async (req) => {
        await access.activate(req.body.token);
        return { ok: true };
      },
    );
    app.post(
      '/verify',
      {
        config: { authRequired: false },
        bodyLimit: 16384,
        schema: { body: z.object({ token: z.string().min(1).max(8192) }) },
      },
      (req, reply) =>
        reply.send({ valid: access.verifyIssued(req.body.token) }),
    );
    const attempts = new Map<string, { count: number; reset: number }>();
    app.post(
      '/login',
      {
        config: { authRequired: false },
        bodyLimit: 16384,
        schema: {
          body: z.object({
            token: z.string().max(8192),
            authorization: z.string().max(2048),
          }),
        },
      },
      async (req, reply) => {
        const now = Date.now();
        const entry = attempts.get(req.ip);
        if (entry && entry.reset > now && entry.count >= 60)
          return reply.code(429).send({ valid: false });
        if (attempts.size >= 1000) attempts.clear();
        attempts.set(
          req.ip,
          entry && entry.reset > now
            ? { ...entry, count: entry.count + 1 }
            : { count: 1, reset: now + 60_000 },
        );
        return {
          valid: await access.verifyCustomerLogin(
            req.body.token,
            req.body.authorization,
          ),
        };
      },
    );
    return Promise.resolve();
  };
