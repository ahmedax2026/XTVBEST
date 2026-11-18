import { z } from 'zod/v4';

export const ChannelArchiveOptionsSchema = z.object({
  threads: z.number().int().min(1).max(32).default(2),
  storageLimitGiB: z.number().min(1).max(1024).default(100),
});
export type ChannelArchiveOptions = z.infer<typeof ChannelArchiveOptionsSchema>;

export const ChannelArchiveStatusSchema = z.object({
  state: z.enum([
    'live',
    'preparing',
    'ready',
    'pending',
    'archived',
    'returning',
    'failed',
  ]),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  bytes: z.number().nonnegative(),
  currentTitle: z.string().optional(),
  error: z.string().optional(),
});
export type ChannelArchiveStatus = z.infer<typeof ChannelArchiveStatusSchema>;
