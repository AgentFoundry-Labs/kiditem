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
