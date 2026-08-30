import { z } from 'zod';

export const CanonicalResourceRefSchema = z
  .object({
    kind: z.string().min(1).max(64),
    id: z.string().min(1).max(128),
    version: z.string().min(1).max(128).nullable(),
  })
  .strict();

export type CanonicalResourceRef = z.infer<typeof CanonicalResourceRefSchema>;
