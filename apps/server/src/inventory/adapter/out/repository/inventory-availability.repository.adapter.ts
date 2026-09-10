import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  InventoryAvailabilityBatchSchema,
  type InventoryAvailabilityBatch,
} from '@kiditem/shared/inventory-availability';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { InventoryAvailabilityRepositoryPort } from '../../../application/port/out/repository/inventory-availability.repository.port';
import { lockSellpiaInventoryTransaction } from './sellpia-inventory-transaction-lock';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class InventoryAvailabilityRepositoryAdapter
implements InventoryAvailabilityRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findAvailability(input: {
    organizationId: string;
    sellpiaInventorySkuIds: string[];
  }): Promise<InventoryAvailabilityBatch> {
    return this.prisma.$transaction(async (tx) => {
      await lockSellpiaInventoryTransaction(tx, input.organizationId);
      const inventorySkus = await loadInventorySkus(
        tx,
        input.organizationId,
        input.sellpiaInventorySkuIds,
      );
      const state = await tx.sellpiaInventoryState.findUnique({
        where: { organizationId: input.organizationId },
        select: {
          verifiedGeneration: true,
          lastVerifiedAt: true,
          lastCompletedImportRunId: true,
        },
      });
      if (
        state === null
        || state.verifiedGeneration <= 0n
        || state.lastVerifiedAt === null
        || state.lastCompletedImportRunId === null
      ) {
        return InventoryAvailabilityBatchSchema.parse({
          snapshot: { collected: false, generation: null, verifiedAt: null },
          items: [],
        });
      }

      const publishedRun = await tx.sourceImportRun.findFirst({
        where: {
          id: state.lastCompletedImportRunId,
          organizationId: input.organizationId,
          sourceType: 'sellpia_inventory',
          channelAccountId: null,
          status: 'completed',
        },
        select: { id: true },
      });
      if (publishedRun === null) {
        return InventoryAvailabilityBatchSchema.parse({
          snapshot: { collected: false, generation: null, verifiedAt: null },
          items: [],
        });
      }

      const generation = state.verifiedGeneration.toString();
      return InventoryAvailabilityBatchSchema.parse({
        snapshot: {
          collected: true,
          generation,
          verifiedAt: state.lastVerifiedAt.toISOString(),
        },
        items: inventorySkus
          .filter((sku) => sku.lastImportRunId === publishedRun.id)
          .map((sku) => ({
            sellpiaInventorySkuId: sku.id,
            currentStock: sku.currentStock,
            availableStock: sku.currentStock,
            isActive: sku.isActive,
            generation,
          })),
      });
    }, TRANSACTION_OPTIONS);
  }
}

async function loadInventorySkus(
  tx: Prisma.TransactionClient,
  organizationId: string,
  sellpiaInventorySkuIds: string[],
) {
  if (sellpiaInventorySkuIds.length === 0) return [];
  const rows = await tx.sellpiaInventorySku.findMany({
    where: { organizationId, id: { in: sellpiaInventorySkuIds } },
    orderBy: { id: 'asc' },
    select: { id: true, currentStock: true, isActive: true, lastImportRunId: true },
  });
  if (rows.length !== sellpiaInventorySkuIds.length) {
    throw new NotFoundException(
      'One or more Sellpia inventory SKUs were not found in this organization',
    );
  }
  return rows;
}
