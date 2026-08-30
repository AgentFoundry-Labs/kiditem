import type { PrismaClient } from "@prisma/client";

/**
 * Explicit test-only fixture for an owned, active Sellpia SKU. Production
 * inventory rows are published only by the snapshot-publication adapter.
 */
export async function seedActiveSellpiaInventorySku(
  prisma: PrismaClient,
  input: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    currentStock?: number;
  },
): Promise<void> {
  await prisma.sellpiaInventorySku.create({
    data: {
      ...input,
      currentStock: input.currentStock ?? 0,
      isActive: true,
    },
  });
}
