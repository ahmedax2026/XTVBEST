import { z } from 'zod/v4';

export const ChannelOverlayStyles = [
  'digital',
  'pill',
  'square',
  'bar',
  'circle',
  'ring',
] as const;
export const ChannelOverlaySchema = z.object({
  enabled: z.boolean().default(false),
  style: z.enum(ChannelOverlayStyles).default('ring'),
  position: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('top-right'),
  size: z.number().int().min(60).max(480).default(160),
  horizontalMargin: z.number().int().min(0).max(500).default(30),
  verticalMargin: z.number().int().min(0).max(500).default(30),
  opacity: z.number().min(0).max(1).default(0.9),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffcc66'),
  hideOnFillers: z.boolean().default(true),
  showTitle: z.boolean().default(false),
});
export type ChannelOverlay = z.infer<typeof ChannelOverlaySchema>;
export const DefaultChannelOverlay = ChannelOverlaySchema.parse({});
