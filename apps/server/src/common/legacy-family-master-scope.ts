import type { Prisma } from '@prisma/client';

/**
 * Shared compatibility scope for read models that still treat MasterProduct as
 * a sellable catalog family. Inventory-owned Sellpia identities are staged in
 * the same table during the expand window, but are not legacy product rows.
 * Each marker independently excludes the row so a partially recovered import
 * cannot leak a physical identity into family counts or AI selection.
 */
export const LEGACY_FAMILY_MASTER_SCOPE = {
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
