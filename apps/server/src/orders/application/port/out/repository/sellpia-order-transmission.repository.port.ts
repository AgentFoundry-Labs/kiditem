export type SellpiaOrderTransmissionStatus = 'prepared' | 'finalized' | 'aborted';
export type SellpiaOrderTransmissionOutcome = 'submitted' | 'not_submitted';

export type SellpiaOrderTransmissionReconciliationRecord = {
  reconciledBy: string;
  reconciledAt: Date;
  note: string;
  outcome: SellpiaOrderTransmissionOutcome;
};

export interface SellpiaOrderTransmissionRepositoryTransaction {
  prepare(input: {
    userId: string;
    preparedAt: Date;
  }): Promise<
    'prepared' | 'already_prepared' | 'already_finalized' | 'not_owned'
  >;
  findForActor(userId: string): Promise<{
    status: SellpiaOrderTransmissionStatus;
  } | null>;
  finalize(input: { userId: string; finalizedAt: Date }): Promise<void>;
  abort(input: { userId: string; abortedAt: Date }): Promise<void>;
  findForReconciliation(): Promise<{
    status: SellpiaOrderTransmissionStatus;
    latestReconciliation: SellpiaOrderTransmissionReconciliationRecord | null;
  } | null>;
  reconcile(input: {
    userId: string;
    reconciledAt: Date;
    note: string;
    outcome: SellpiaOrderTransmissionOutcome;
  }): Promise<void>;
}

export interface SellpiaOrderTransmissionRepositoryPort {
  withLockedIntent<T>(
    input: { organizationId: string; intentKey: string },
    operation: (
      transaction: SellpiaOrderTransmissionRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export const SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT = Symbol(
  'SELLPIA_ORDER_TRANSMISSION_REPOSITORY_PORT',
);
