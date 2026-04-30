import type { RepositoryTransaction } from './repository-transaction';

export const BUNDLE_STOCK_PORT = Symbol('BundleStockPort');

// Cross-owner-domain port: bundle availableStock is owned by products.
// Inventory triggers fan-out via this port from inside its own transaction.
// The adapter implementation is the only call site of
// BundleStockService.recomputeForComponent (ADR-0014 single-writer invariant).
export interface BundleStockPort {
  recomputeForComponent(
    companyId: string,
    componentOptionId: string,
    tx: RepositoryTransaction,
  ): Promise<string[]>;
}
