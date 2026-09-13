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
