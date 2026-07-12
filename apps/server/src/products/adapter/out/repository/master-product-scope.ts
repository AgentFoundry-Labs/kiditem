import type { Prisma } from '@prisma/client';

/**
 * Product APIs own legacy family Masters only. The additive 0.1.8 physical
 * rows are Inventory-owned and must stay outside ordinary family CRUD even if
 * one marker is incomplete during a rolling import/recovery.
 */
export const PRODUCTS_OWNED_MASTER_SCOPE = {
  OR: [
    {
      sellpiaProductCode: null,
      temporaryReason: null,
      lifecycleState: { not: 'inventory_staged' },
    },
    {
      sellpiaProductCode: null,
      temporaryReason: { not: 'sellpia_master_cutover' },
      lifecycleState: { not: 'inventory_staged' },
    },
  ],
} satisfies Prisma.MasterProductWhereInput;
