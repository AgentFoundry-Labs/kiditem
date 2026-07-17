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

const InventoryCommitmentActorSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
}).strict();

export const InventoryCommitmentAllocationReadSchema = z.object({
  sellpiaInventorySkuId: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().nullable(),
  unitsPerItem: z.number().int().positive(),
  quantity: z.number().int().positive(),
  currentStock: InventoryStockLevelsSchema.shape.currentStock,
  activeCommitmentQuantity:
    InventoryStockLevelsSchema.shape.activeCommitmentQuantity,
  availableStock: InventoryStockLevelsSchema.shape.availableStock,
  isActive: z.boolean(),
}).strict().superRefine((allocation, ctx) => {
  const expectedAvailableStock = Math.max(
    allocation.currentStock - allocation.activeCommitmentQuantity,
    0,
  );
  if (allocation.availableStock !== expectedAvailableStock) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['availableStock'],
      message: 'availableStock must equal currentStock minus activeCommitmentQuantity',
    });
  }
});
export type InventoryCommitmentAllocationRead = z.infer<
  typeof InventoryCommitmentAllocationReadSchema
>;

export const InventoryCommitmentReadSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  predecessorCommitmentId: z.string().uuid().nullable(),
  kind: InventoryCommitmentKindSchema,
  status: InventoryCommitmentStatusSchema,
  unitQuantity: z.number().int().positive(),
  inventoryGeneration: z.string().regex(/^\d+$/).nullable(),
  createdBy: InventoryCommitmentActorSchema,
  createdAt: zIsoDate,
  releasedBy: InventoryCommitmentActorSchema.nullable(),
  releasedAt: zIsoDate.nullable(),
  releaseReason: z.string().nullable(),
  settledBy: InventoryCommitmentActorSchema.nullable(),
  settledAt: zIsoDate.nullable(),
  settlementReason: z.string().nullable(),
  canRelease: z.boolean(),
  canSettle: z.boolean(),
  allocations: z.array(InventoryCommitmentAllocationReadSchema).min(1),
}).strict();
export type InventoryCommitmentRead = z.infer<
  typeof InventoryCommitmentReadSchema
>;

export const RocketPurchaseCommitmentListRequestSchema = z.object({
  channelAccountId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
export type RocketPurchaseCommitmentListRequest = z.infer<
  typeof RocketPurchaseCommitmentListRequestSchema
>;

export const RocketPurchaseCommitmentListItemSchema = z.object({
  confirmationId: z.string().uuid(),
  confirmationLineId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  poNumber: z.string().min(1),
  productNo: z.string().min(1),
  barcode: z.string().nullable(),
  productName: z.string().min(1),
  orderQuantity: z.number().int().nonnegative(),
  confirmedQuantity: z.number().int().nonnegative(),
  confirmedBy: InventoryCommitmentActorSchema,
  confirmedAt: zIsoDate,
  requestCommitment: InventoryCommitmentReadSchema.nullable(),
  finalOrderCommitment: InventoryCommitmentReadSchema.nullable(),
  orderLineItemId: z.string().uuid().nullable(),
  canRelease: z.boolean(),
  canSettle: z.boolean(),
}).strict();
export type RocketPurchaseCommitmentListItem = z.infer<
  typeof RocketPurchaseCommitmentListItemSchema
>;

export const RocketPurchaseCommitmentListResponseSchema = z.object({
  items: z.array(RocketPurchaseCommitmentListItemSchema),
  nextCursor: z.string().uuid().nullable(),
}).strict();
export type RocketPurchaseCommitmentListResponse = z.infer<
  typeof RocketPurchaseCommitmentListResponseSchema
>;

export const RocketPurchaseCommitmentActionRequestSchema = z.object({
  commitmentIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().trim().min(1).max(500),
}).strict();
export type RocketPurchaseCommitmentActionRequest = z.infer<
  typeof RocketPurchaseCommitmentActionRequestSchema
>;

export const RocketPurchaseCommitmentActionResponseSchema = z.object({
  affectedCommitmentIds: z.array(z.string().uuid()).min(1),
}).strict();
export type RocketPurchaseCommitmentActionResponse = z.infer<
  typeof RocketPurchaseCommitmentActionResponseSchema
>;
