import type {
  SellpiaInventoryCollectionState,
  SellpiaInventoryCollectionStatePatch,
} from '../../../../domain/policy/sellpia-inventory-freshness.policy';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export type SellpiaInventoryStatePatch = SellpiaInventoryCollectionStatePatch;

export type SellpiaInventoryStateExpectation = {
  freshnessFence: string;
  requestedGeneration?: bigint;
  activeGeneration?: bigint | null;
  activeSyncToken?: string | null;
  activeSyncOwnerUserId?: string | null;
  activeSyncLeaseExpiresAt?: Date | null;
};

export interface SellpiaInventoryFreshnessRepositoryTransaction {
  getState(): Promise<SellpiaInventoryCollectionState>;

  compareAndSetState(input: {
    expected: SellpiaInventoryStateExpectation;
    patch: SellpiaInventoryStatePatch;
  }): Promise<SellpiaInventoryCollectionState>;

  findInventoryAvailability(
    sellpiaInventorySkuIds: string[],
  ): Promise<InventoryAvailabilityBatch>;
}

export interface SellpiaInventoryFreshnessRepositoryPort {
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
      transaction: SellpiaInventoryFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export const SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT',
);
