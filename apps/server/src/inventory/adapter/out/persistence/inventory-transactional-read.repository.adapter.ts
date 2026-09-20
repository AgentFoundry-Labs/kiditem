import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  readActiveInventoryMatchingCandidates,
  readInventoryAvailability,
  readInventoryAvailabilityCandidates,
  readInventorySaleAgeMappings,
  readInventorySkuIdentities,
} from './read/inventory-availability';
import {
  lockSellpiaInventory,
  type SellpiaInventoryLock,
} from './transaction/sellpia-inventory-lock';
import type {
  InventoryCollectionFence,
  InventoryLockEvidence,
  InventoryTransactionContext,
  InventoryTransactionalReadPort,
} from '../../../application/port/in/stock/inventory-transactional-read.port';

@Injectable()
export class InventoryTransactionalReadRepositoryAdapter
implements InventoryTransactionalReadPort {
async lockCollectionFence<TClient>(
  context: InventoryTransactionContext<TClient>,
  organizationId: string,
): Promise<InventoryCollectionFence | null> {
  const tx = this.transaction(context);
  await lockSellpiaInventory(tx, organizationId);
  const rows = await tx.$queryRaw<InventoryCollectionFence[]>`
    SELECT
      freshness_fence AS "freshnessFence",
      verified_generation AS "freshnessGeneration",
      last_verified_at AS "lastVerifiedAt",
      last_completed_import_run_id AS "lastCompletedImportRunId",
      requested_generation AS "requestedGeneration",
      active_generation AS "activeGeneration",
      failed_generation AS "failedGeneration",
      CURRENT_TIMESTAMP AS "databaseNow"
    FROM sellpia_inventory_states
    WHERE organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}


  async lock<TClient>(
    context: InventoryTransactionContext<TClient>,
    organizationId: string,
  ): Promise<InventoryLockEvidence> {
    const lock = await lockSellpiaInventory(this.transaction(context), organizationId);
    return lock as unknown as InventoryLockEvidence;
  }

  readAvailability<TClient>(
    context: InventoryTransactionContext<TClient>,
    lock: InventoryLockEvidence,
    input: Parameters<typeof readInventoryAvailability>[2],
  ) {
    return readInventoryAvailability(
      this.transaction(context),
      this.sellpiaLock(lock),
      input,
    );
  }

  readAvailabilityCandidates<TClient>(
    context: InventoryTransactionContext<TClient>,
    lock: InventoryLockEvidence,
    input: Parameters<typeof readInventoryAvailabilityCandidates>[2],
  ) {
    return readInventoryAvailabilityCandidates(
      this.transaction(context),
      this.sellpiaLock(lock),
      input,
    );
  }

  readActiveMatchingCandidates<TClient>(
    context: InventoryTransactionContext<TClient>,
    lock: InventoryLockEvidence,
    organizationId: string,
  ) {
    return readActiveInventoryMatchingCandidates(
      this.transaction(context),
      this.sellpiaLock(lock),
      organizationId,
    );
  }

  readSkuIdentities<TClient>(
    context: InventoryTransactionContext<TClient>,
    input: Parameters<typeof readInventorySkuIdentities>[1],
  ) {
    return readInventorySkuIdentities(this.transaction(context), input);
  }

  readSaleAgeMappings<TClient>(
    context: InventoryTransactionContext<TClient>,
    organizationId: string,
    masterProductIds: string[],
  ) {
    return readInventorySaleAgeMappings(
      this.transaction(context),
      organizationId,
      masterProductIds,
    );
  }

  private transaction<TClient>(
    context: InventoryTransactionContext<TClient>,
  ): Prisma.TransactionClient {
    return context.client as Prisma.TransactionClient;
  }

  private sellpiaLock(lock: InventoryLockEvidence): SellpiaInventoryLock {
    return lock as unknown as SellpiaInventoryLock;
  }
}
