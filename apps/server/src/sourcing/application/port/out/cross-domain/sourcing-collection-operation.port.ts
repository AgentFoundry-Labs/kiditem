export const SOURCING_COLLECTION_OPERATION_PORT = Symbol(
  'SOURCING_COLLECTION_OPERATION_PORT',
);

export interface SourcingCollectionOperationPort {
  startCollection(input: {
    organizationId: string;
    requestedByUserId: string | null;
    sources: Array<'naver' | '1688' | 'shorts'>;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; status: string }>;
}
