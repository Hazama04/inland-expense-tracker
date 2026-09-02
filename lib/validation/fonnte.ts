import { z } from 'zod';

export const fonnteWebhookPayloadSchema = z.object({
  sender: z.string().trim().min(1, 'Sender phone number is required'),
  message: z.string().default(''),
  url: z.string().trim().optional().nullable(),
  file: z.string().trim().optional().nullable(),
  image: z.string().trim().optional().nullable(),
  name: z.string().trim().optional().nullable(),
  id: z.string().trim().optional().nullable(),
  message_id: z.string().trim().optional().nullable(),
  device: z.string().trim().optional().nullable(),
  secret_key: z.string().trim().optional().nullable(),
});

export type FonnteWebhookPayload = z.infer<typeof fonnteWebhookPayloadSchema>;
