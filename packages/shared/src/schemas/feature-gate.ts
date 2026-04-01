import { z } from 'zod';

export const FeatureGateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  allowedCompanies: z.array(z.string()),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type FeatureGate = z.infer<typeof FeatureGateSchema>;
