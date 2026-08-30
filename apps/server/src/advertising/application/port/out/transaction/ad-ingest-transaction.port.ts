import type { ActiveBrowserAttemptTransaction } from '../../../../../operations/application/port/active-browser-attempt-transaction';

export const AD_INGEST_TRANSACTION_PORT = Symbol('AdIngestTransactionPort');

export interface AdIngestTransactionPort {
  runIdempotent<T extends Record<string, unknown>>(
    input: { organizationId: string; idempotencyKey: string },
    operation: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }>;
  runIdempotentInAttempt<T extends Record<string, unknown>>(
    transaction: ActiveBrowserAttemptTransaction,
    input: { organizationId: string; idempotencyKey: string },
    operation: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }>;
}
