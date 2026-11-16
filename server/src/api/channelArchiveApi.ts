import { z } from 'zod/v4';
import {
  ChannelArchiveOptionsSchema,
  ChannelArchiveStatusSchema,
} from '@tunarr/types';
import { container } from '../container.ts';
import { ChannelArchiveService } from '../services/archive/ChannelArchiveService.ts';
import type { RouterPluginAsyncCallback } from '../types/serverType.js';

export const channelArchiveApi: RouterPluginAsyncCallback = (fastify) => {
  let archiveService: ChannelArchiveService | undefined;
  const service = () =>
    (archiveService ??= container.get(ChannelArchiveService));
  fastify.addHook(
    'onClose',
    () => archiveService?.shutdown() ?? Promise.resolve(),
  );
  const params = z.object({ id: z.uuid() });
  const response = {
    200: ChannelArchiveStatusSchema,
    409: z.object({ error: z.string() }),
  };
  fastify.get(
    '/channels/:id/archive',
    { schema: { params, response } },
    async (req, reply) => {
      try {
        return reply.send(await service().status(req.params.id));
      } catch {
        return reply
          .code(409)
          .send({ error: 'Unable to read the channel archive' });
      }
    },
  );
  fastify.post(
    '/channels/:id/archive/prepare',
    {
      schema: { params, body: ChannelArchiveOptionsSchema, response },
    },
    async (req, reply) => {
      try {
        return reply.send(
          await container
            .get(ChannelArchiveService)
            .prepare(req.params.id, req.body),
        );
      } catch (error) {
        return reply.code(409).send({
          error:
            error instanceof Error
              ? error.message
              : 'Unable to prepare archive',
        });
      }
    },
  );
  fastify.post(
    '/channels/:id/archive/cancel',
    { schema: { params, response } },
    async (req, reply) => {
      try {
        return reply.send(await service().cancel(req.params.id));
      } catch {
        return reply.code(409).send({ error: 'Unable to cancel preparation' });
      }
    },
  );
  fastify.post(
    '/channels/:id/archive/mode',
    {
      schema: {
        params,
        body: z.object({ mode: z.enum(['archive', 'live']) }),
        response,
      },
    },
    async (req, reply) => {
      try {
        return reply.send(
          await container
            .get(ChannelArchiveService)
            .setMode(req.params.id, req.body.mode),
        );
      } catch (error) {
        return reply.code(409).send({
          error:
            error instanceof Error ? error.message : 'Unable to switch mode',
        });
      }
    },
  );
  return Promise.resolve();
};
