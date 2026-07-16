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

export type SellpiaOrderTransmissionIntentRecord = {
  status: 'prepared' | 'finalized' | 'aborted';
  finalizedGeneration: bigint | null;
};

export type SellpiaOrderTransmissionIntentReconciliationRecord = {
  reconciledBy: string;
  reconciledAt: Date;
  note: string;
  outcome: 'submitted' | 'not_submitted';
};

export type SellpiaOrderTransmissionIntentReconcileRecord =
  SellpiaOrderTransmissionIntentRecord & {
    latestReconciliation: SellpiaOrderTransmissionIntentReconciliationRecord | null;
  };

export interface SellpiaInventoryFreshnessRepositoryTransaction {
  getState(): Promise<SellpiaInventoryFreshnessState>;

  compareAndSetState(input: {
    expected: SellpiaInventoryStateExpectation;
    patch: SellpiaInventoryStatePatch;
  }): Promise<SellpiaInventoryFreshnessState>;

  prepareOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    preparedAt: Date;
  }): Promise<'prepared' | 'already_prepared' | 'already_finalized' | 'not_owned'>;

  findOrderTransmissionIntent(
    intentKey: string,
    userId: string,
  ): Promise<SellpiaOrderTransmissionIntentRecord | null>;

  finalizeOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    finalizedGeneration: bigint;
    finalizedAt: Date;
  }): Promise<void>;

  abortOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    abortedAt: Date;
  }): Promise<void>;

  findOrderTransmissionIntentForReconciliation(
    intentKey: string,
  ): Promise<SellpiaOrderTransmissionIntentReconcileRecord | null>;

  reconcileOrderTransmissionIntent(input: {
    intentKey: string;
    userId: string;
    reconciledAt: Date;
    note: string;
    outcome: 'submitted' | 'not_submitted';
    finalizedGeneration: bigint | null;
  }): Promise<void>;

  hasFailedAttempt(input: {
    claimToken: string;
    createdBy: string;
  }): Promise<boolean>;

  upsertFailedAttempt(input: FailedSellpiaInventoryAttempt): Promise<void>;

  findMasterProducts(
    masterProductIds: string[],
  ): Promise<Array<{ id: string; isActive: boolean; currentStock: number }>>;
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
