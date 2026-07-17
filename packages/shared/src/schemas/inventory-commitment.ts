import { z } from 'zod';
import { zIsoDate } from './common.js';

export const InventoryCommitmentKindSchema = z.enum([
  'rocket_request',
  'rocket_final_order',
]);
export type InventoryCommitmentKind = z.infer<
  typeof InventoryCommitmentKindSchema
>;

export const InventoryCommitmentStatusSchema = z.enum([
  'active',
  'released',
  'settled',
]);
export type InventoryCommitmentStatus = z.infer<
  typeof InventoryCommitmentStatusSchema
>;

const InventoryStockLevelsSchema = z.object({
  currentStock: z.number().int().nonnegative(),
  activeCommitmentQuantity: z.number().int().nonnegative(),
  availableStock: z.number().int().nonnegative(),
});

export const InventorySkuAvailabilitySchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  currentStock: InventoryStockLevelsSchema.shape.currentStock,
  activeCommitmentQuantity:
    InventoryStockLevelsSchema.shape.activeCommitmentQuantity,
  availableStock: InventoryStockLevelsSchema.shape.availableStock,
  isActive: z.boolean(),
  generation: z.string().regex(/^\d+$/).nullable(),
}).strict().superRefine((availability, ctx) => {
  const expectedAvailableStock = Math.max(
    availability.currentStock - availability.activeCommitmentQuantity,
    0,
  );

  if (availability.availableStock !== expectedAvailableStock) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableStock'],
      message: 'availableStock must equal currentStock minus activeCommitmentQuantity',
    });
  }
});
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
    if (batch.items.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'Uncollected snapshot must not include inventory items',
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
