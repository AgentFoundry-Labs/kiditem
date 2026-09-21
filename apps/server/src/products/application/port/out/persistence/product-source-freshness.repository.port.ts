import type {
  SellpiaInventoryCollectionState,
  SellpiaInventoryCollectionStatePatch,
} from '../../../../domain/policy/product-source-freshness.policy';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export type ProductSourceStatePatch = SellpiaInventoryCollectionStatePatch;

export type ProductSourceStateExpectation = {
  freshnessFence: string;
  requestedGeneration?: bigint;
  activeGeneration?: bigint | null;
  activeSyncToken?: string | null;
  activeSyncOwnerUserId?: string | null;
  activeSyncLeaseExpiresAt?: Date | null;
};

export interface ProductCollectionFreshnessRepositoryTransaction {
  getState(): Promise<SellpiaInventoryCollectionState>;

  compareAndSetState(input: {
    expected: ProductSourceStateExpectation;
    patch: ProductSourceStatePatch;
  }): Promise<SellpiaInventoryCollectionState>;

  findProductAvailability(
    masterProductIds: string[],
  ): Promise<InventoryAvailabilityBatch>;
}

export interface ProductCollectionFreshnessRepositoryPort {
  readState(
    organizationId: string,
  ): Promise<SellpiaInventoryCollectionState | null>;

  /**
   * The browser source attempt whose token holds the lease. A manual upload
   * claims the lease with a token no attempt carries, so it names none.
   */
  findLeaseAttemptId(input: {
    organizationId: string;
    activeSyncToken: string;
  }): Promise<string | null>;

  /** Latest source attempt identity lets a waiting calculation fail fast. */
  findLastAttemptId?(input: {
    organizationId: string;
  }): Promise<string | null>;

  withLockedState<T>(
    input: {
      organizationId: string;
      createInitialState: () => SellpiaInventoryCollectionState;
    },
    operation: (
      transaction: ProductCollectionFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export const PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT = Symbol(
  'PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT',
);

/** Compatibility aliases used while callers move to Product contracts. */
export type SellpiaInventoryStatePatch = ProductSourceStatePatch;
export type SellpiaInventoryStateExpectation = ProductSourceStateExpectation;
export type SellpiaInventoryFreshnessRepositoryTransaction =
  ProductCollectionFreshnessRepositoryTransaction;
export type SellpiaInventoryFreshnessRepositoryPort =
  ProductCollectionFreshnessRepositoryPort;
export const SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT =
  PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT;
