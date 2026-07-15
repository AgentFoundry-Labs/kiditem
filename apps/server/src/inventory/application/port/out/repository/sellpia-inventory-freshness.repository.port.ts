import type {
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryRefreshReason,
} from '@kiditem/shared/sellpia-inventory-freshness';
import type {
  SellpiaInventoryFreshnessState,
  SellpiaInventoryFreshnessStatePatch,
} from '../../../../domain/policy/sellpia-inventory-freshness.policy';

export type SellpiaInventoryStatePatch = SellpiaInventoryFreshnessStatePatch;

export type SellpiaInventoryStateExpectation = {
  freshnessFence: string;
  requestedGeneration?: bigint;
  activeGeneration?: bigint | null;
  activeSyncToken?: string | null;
  activeSyncOwnerUserId?: string | null;
  activeSyncLeaseExpiresAt?: Date | null;
};

export type FailedSellpiaInventoryAttempt = {
  organizationId: string;
  generation: bigint;
  claimToken: string;
  trigger: SellpiaInventoryRefreshReason | null;
  errorCode: SellpiaInventoryCollectionFailureCode;
  errorMessage: string;
  attemptedAt: Date;
  createdBy: string;
};

export interface SellpiaInventoryFreshnessRepositoryTransaction {
  getState(): Promise<SellpiaInventoryFreshnessState>;

  compareAndSetState(input: {
    expected: SellpiaInventoryStateExpectation;
    patch: SellpiaInventoryStatePatch;
  }): Promise<SellpiaInventoryFreshnessState>;

  hasFailedAttempt(input: {
    claimToken: string;
    createdBy: string;
  }): Promise<boolean>;

  upsertFailedAttempt(input: FailedSellpiaInventoryAttempt): Promise<void>;

  findMasterProducts(
    masterProductIds: string[],
  ): Promise<Array<{ id: string; isActive: boolean }>>;
}

export interface SellpiaInventoryFreshnessRepositoryPort {
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
