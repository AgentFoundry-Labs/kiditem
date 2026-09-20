import { z } from 'zod';
import { zIsoDate } from './common.js';

export const InventorySkuAvailabilitySchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  currentStock: z.number().int().nonnegative(),
  generation: z.string().regex(/^\d+$/).nullable(),
}).strict();
export type InventorySkuAvailability = z.infer<
  typeof InventorySkuAvailabilitySchema
>;

const InventorySnapshotStateSchema = z.object({
  collected: z.boolean(),
  generation: z.string().regex(/^\d+$/).nullable(),
  verifiedAt: zIsoDate.nullable(),
}).strict();

export const InventoryAvailabilityBatchSchema = z.object({
  snapshot: InventorySnapshotStateSchema,
  items: z.array(InventorySkuAvailabilitySchema),
}).strict().superRefine((batch, ctx) => {
  const { snapshot } = batch;

  if (!snapshot.collected) {
    if (snapshot.generation !== null || snapshot.verifiedAt !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snapshot'],
        message: 'Uncollected snapshot must not include generation or verifiedAt',
      });
    }
    return;
  }

  if (snapshot.generation === null || snapshot.verifiedAt === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['snapshot'],
      message: 'Collected snapshot requires generation and verifiedAt',
    });
  }
});
export type InventoryAvailabilityBatch = z.infer<
  typeof InventoryAvailabilityBatchSchema
>;
