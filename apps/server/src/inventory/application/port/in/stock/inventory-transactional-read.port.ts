import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';
import type {
  InventoryAvailabilityCandidate,
  InventoryAvailabilityCandidateQuery,
  InventoryAvailabilityQuery,
  InventoryMatchingCandidate,
  InventorySaleAgeMapping,
  InventorySkuIdentityQuery,
  SellpiaInventorySkuReadModel,
} from '../../../../domain/inventory-item';

/**
 * A caller-owned interactive transaction.  Inventory never starts or commits
 * this transaction; it only uses the client supplied by the caller.
 */
export type InventoryTransactionContext<TClient = unknown> = Readonly<{
  client: TClient;
}>;

declare const INVENTORY_LOCK_EVIDENCE: unique symbol;

/** Opaque proof that the supplied transaction holds Inventory's advisory lock. */
export type InventoryLockEvidence = Readonly<{
  readonly [INVENTORY_LOCK_EVIDENCE]: true;
}>;

export type InventoryCollectionFence = Readonly<{
  freshnessFence: string;
  freshnessGeneration: bigint;
  lastVerifiedAt: Date | null;
  lastCompletedImportRunId: string | null;
  requestedGeneration: bigint;
  activeGeneration: bigint | null;
  failedGeneration: bigint | null;
  databaseNow: Date;
}>;

export interface InventoryTransactionalReadPort {
  lockCollectionFence<TClient>(
    context: InventoryTransactionContext<TClient>,
    organizationId: string,
  ): Promise<InventoryCollectionFence | null>;

  lock<TClient>(
    context: InventoryTransactionContext<TClient>,
    organizationId: string,
  ): Promise<InventoryLockEvidence>;

  readAvailability<TClient>(
    context: InventoryTransactionContext<TClient>,
    lock: InventoryLockEvidence,
    input: InventoryAvailabilityQuery,
  ): Promise<InventoryAvailabilityBatch>;

  readAvailabilityCandidates<TClient>(
    context: InventoryTransactionContext<TClient>,
    lock: InventoryLockEvidence,
    input: InventoryAvailabilityCandidateQuery,
  ): Promise<InventoryAvailabilityCandidate[]>;

  readActiveMatchingCandidates<TClient>(
    context: InventoryTransactionContext<TClient>,
    lock: InventoryLockEvidence,
    organizationId: string,
  ): Promise<InventoryMatchingCandidate[]>;

  readSkuIdentities<TClient>(
    context: InventoryTransactionContext<TClient>,
    input: InventorySkuIdentityQuery,
  ): Promise<SellpiaInventorySkuReadModel[]>;

  readSaleAgeMappings<TClient>(
    context: InventoryTransactionContext<TClient>,
    organizationId: string,
    masterProductIds: string[],
  ): Promise<InventorySaleAgeMapping[]>;
}

export const INVENTORY_TRANSACTIONAL_READ_PORT = Symbol(
  'INVENTORY_TRANSACTIONAL_READ_PORT',
);

export type {
  InventoryAvailabilityCandidate,
  InventoryAvailabilityCandidateQuery,
  InventoryAvailabilityQuery,
  InventoryMatchingCandidate,
  InventorySaleAgeMapping,
  InventorySkuIdentityQuery,
  SellpiaInventorySkuReadModel,
};
