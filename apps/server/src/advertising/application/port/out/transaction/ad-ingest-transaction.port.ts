export const AD_INGEST_TRANSACTION_PORT = Symbol('AdIngestTransactionPort');

export interface AdIngestTransactionPort {
  runIdempotent<T extends Record<string, unknown>>(
    input: { organizationId: string; idempotencyKey: string },
    operation: () => Promise<T>,
  ): Promise<{ value: T; replayed: boolean }>;
}
