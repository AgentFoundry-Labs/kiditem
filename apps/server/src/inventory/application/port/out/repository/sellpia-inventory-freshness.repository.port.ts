import type {
  SellpiaInventoryFreshnessState,
  SellpiaInventoryFreshnessStatePatch,
} from '../../../../domain/policy/sellpia-inventory-freshness.policy';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export type SellpiaInventoryStatePatch = SellpiaInventoryFreshnessStatePatch;

export type SellpiaInventoryStateExpectation = {
  freshnessFence: string;
  requestedGeneration?: bigint;
  activeGeneration?: bigint | null;
  activeSyncToken?: string | null;
  activeSyncOwnerUserId?: string | null;
  activeSyncLeaseExpiresAt?: Date | null;
};

export interface SellpiaInventoryFreshnessRepositoryTransaction {
  getState(): Promise<SellpiaInventoryFreshnessState>;

  compareAndSetState(input: {
    expected: SellpiaInventoryStateExpectation;
    patch: SellpiaInventoryStatePatch;
  }): Promise<SellpiaInventoryFreshnessState>;

  findInventoryAvailability(
    sellpiaInventorySkuIds: string[],
  ): Promise<InventoryAvailabilityBatch>;
}

export interface SellpiaInventoryFreshnessRepositoryPort {
  readState(
    organizationId: string,
  ): Promise<SellpiaInventoryFreshnessState | null>;

  /**
   * The browser source attempt whose token holds the lease. A manual upload
   * claims the lease with a token no attempt carries, so it names none.
   */
  findLeaseAttemptId(input: {
    organizationId: string;
    activeSyncToken: string;
  }): Promise<string | null>;

  withLockedState<T>(
    input: {
      organizationId: string;
      createInitialState: () => SellpiaInventoryFreshnessState;
    },
    operation: (
      transaction: SellpiaInventoryFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export const SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT',
);
