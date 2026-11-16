import { z } from 'zod/v4';
import { ChannelOverlaySchema } from '@tunarr/types';
import { container } from '../container.ts';
import { ChannelOverlayService } from '../services/overlay/ChannelOverlayService.ts';
import type { RouterPluginAsyncCallback } from '../types/serverType.js';

export const channelOverlayApi: RouterPluginAsyncCallback = (fastify) => {
  const params = z.object({ id: z.uuid() });
  const response = {
    200: ChannelOverlaySchema,
    409: z.object({ error: z.string() }),
  };
  fastify.get(
    '/channels/:id/overlay',
    { schema: { params, response } },
    async (req, reply) => {
      try {
        return reply.send(
          await container.get(ChannelOverlayService).get(req.params.id),
        );
      } catch {
        return reply
          .code(409)
          .send({ error: 'Unable to load channel overlay' });
      }
    },
  );
  fastify.put(
    '/channels/:id/overlay',
    { schema: { params, body: ChannelOverlaySchema, response } },
    async (req, reply) => {
      try {
        return reply.send(
          await container
            .get(ChannelOverlayService)
            .save(req.params.id, req.body),
        );
      } catch {
        return reply
          .code(409)
          .send({
            error:
              'Unable to save overlay. Select the built-in transcoded HLS or MPEG-TS engine.',
          });
      }
    },
  );
  return Promise.resolve();
};
