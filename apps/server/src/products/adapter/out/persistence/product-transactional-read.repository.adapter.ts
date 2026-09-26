import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  readActiveProductMatchingCandidates,
  readProductSourceAvailability,
  readProductAvailabilityCandidates,
  readProductSaleAgeMappings,
  readProductSourceIdentities,
} from './read/product-source-availability';
import {
  lockProductSource,
  type ProductSourceLock,
} from './transaction/product-source-lock';
import type {
  ProductCollectionFence,
  ProductLockEvidence,
  ProductTransactionContext,
  ProductTransactionalReadPort,
} from '../../../application/port/in/product-transactional-read.port';

@Injectable()
export class ProductTransactionalReadRepositoryAdapter
implements ProductTransactionalReadPort {
async lockCollectionFence<TClient>(
  context: ProductTransactionContext<TClient>,
  organizationId: string,
): Promise<ProductCollectionFence | null> {
  const tx = this.transaction(context);
  await lockProductSource(tx, organizationId);
  const rows = await tx.$queryRaw<ProductCollectionFence[]>`
    SELECT
      freshness_fence AS "freshnessFence",
      verified_generation AS "freshnessGeneration",
      last_verified_at AS "lastVerifiedAt",
      last_completed_operation_id AS "lastCompletedOperationId",
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
    context: ProductTransactionContext<TClient>,
    organizationId: string,
  ): Promise<ProductLockEvidence> {
    const lock = await lockProductSource(this.transaction(context), organizationId);
    return lock as unknown as ProductLockEvidence;
  }

  readAvailability<TClient>(
    context: ProductTransactionContext<TClient>,
    lock: ProductLockEvidence,
    input: Parameters<typeof readProductSourceAvailability>[2],
  ) {
    return readProductSourceAvailability(
      this.transaction(context),
      this.productSourceLock(lock),
      input,
    );
  }

  readAvailabilityCandidates<TClient>(
    context: ProductTransactionContext<TClient>,
    lock: ProductLockEvidence,
    input: Parameters<typeof readProductAvailabilityCandidates>[2],
  ) {
    return readProductAvailabilityCandidates(
      this.transaction(context),
      this.productSourceLock(lock),
      input,
    );
  }

  readActiveMatchingCandidates<TClient>(
    context: ProductTransactionContext<TClient>,
    lock: ProductLockEvidence,
    organizationId: string,
  ) {
    return readActiveProductMatchingCandidates(
      this.transaction(context),
      this.productSourceLock(lock),
      organizationId,
    );
  }

  readSourceIdentities<TClient>(
    context: ProductTransactionContext<TClient>,
    input: Parameters<typeof readProductSourceIdentities>[1],
  ) {
    return readProductSourceIdentities(this.transaction(context), input);
  }

  readSaleAgeMappings<TClient>(
    context: ProductTransactionContext<TClient>,
    organizationId: string,
    masterProductIds: string[],
  ) {
    return readProductSaleAgeMappings(
      this.transaction(context),
      organizationId,
      masterProductIds,
    );
  }

  private transaction<TClient>(
    context: ProductTransactionContext<TClient>,
  ): Prisma.TransactionClient {
    return context.client as Prisma.TransactionClient;
  }

  private productSourceLock(lock: ProductLockEvidence): ProductSourceLock {
    return lock as unknown as ProductSourceLock;
  }
}
