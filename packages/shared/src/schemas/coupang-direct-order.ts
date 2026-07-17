import { z } from 'zod';

export const CoupangDirectTransportSchema = z.enum(['SHIPMENT', 'MILKRUN']);
export type CoupangDirectTransport = z.infer<
  typeof CoupangDirectTransportSchema
>;

export const CoupangDirectOrderStatusSchema = z.enum(['PA', '발주확정']);
export type CoupangDirectOrderStatus = z.infer<
  typeof CoupangDirectOrderStatusSchema
>;

export const CoupangDirectOrderItemSchema = z.object({
  skuId: z.string().trim().min(1),
  barcode: z.string().trim(),
  name: z.string().trim().min(1),
  qty: z.number().int().nonnegative(),
  amount: z.number().nonnegative(),
}).strict();
export type CoupangDirectOrderItem = z.infer<
  typeof CoupangDirectOrderItemSchema
>;

export const CoupangDirectPurchaseOrderSchema = z.object({
  seq: z.union([
    z.string().trim().min(1),
    z.number().int().nonnegative().transform(String),
  ]),
  status: CoupangDirectOrderStatusSchema,
  center: z.string().trim().min(1),
  transport: CoupangDirectTransportSchema,
  edd: z.string().trim().min(1),
  reg: z.string().trim().min(1),
  items: z.array(CoupangDirectOrderItemSchema).min(1),
}).strict();
export type CoupangDirectPurchaseOrder = z.infer<
  typeof CoupangDirectPurchaseOrderSchema
>;

export const CoupangDirectCenterSchema = z.object({
  addr: z.string().trim().min(1).optional(),
  zip: z.union([z.string().trim().min(1), z.number().int().nonnegative()]).optional(),
  contact: z.string().trim().min(1).optional(),
}).strict();
export type CoupangDirectCenter = z.infer<typeof CoupangDirectCenterSchema>;

export const CoupangDirectOrderCollectionRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  pos: z.array(CoupangDirectPurchaseOrderSchema).max(4_000),
  centers: z.record(z.string(), CoupangDirectCenterSchema),
  transport: CoupangDirectTransportSchema,
}).strict().superRefine((request, ctx) => {
  const seenLineKeys = new Set<string>();

  request.pos.forEach((purchaseOrder, purchaseOrderIndex) => {
    purchaseOrder.items.forEach((item, itemIndex) => {
      const lineKey = `${purchaseOrder.seq}\u0000${item.skuId}`;
      if (seenLineKeys.has(lineKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pos', purchaseOrderIndex, 'items', itemIndex, 'skuId'],
          message: 'Duplicate (seq, skuId) line',
        });
      }
      seenLineKeys.add(lineKey);
    });
  });
});
export type CoupangDirectOrderCollectionRequest = z.infer<
  typeof CoupangDirectOrderCollectionRequestSchema
>;
