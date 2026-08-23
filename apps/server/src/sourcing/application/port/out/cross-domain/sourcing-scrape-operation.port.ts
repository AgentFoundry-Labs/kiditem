export const SOURCING_SCRAPE_OPERATION_PORT = Symbol('SOURCING_SCRAPE_OPERATION_PORT');

export interface SourcingScrapeOperationPort {
  startDirect(input: {
    organizationId: string;
    requestedByUserId: string | null;
    sourceUrl: string;
    idempotencyKey: string;
  }): Promise<{ operationRunId: string; status: string }>;
}
