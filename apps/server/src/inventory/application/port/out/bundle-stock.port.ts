import type { RepositoryTransaction } from './repository-transaction';

export const BUNDLE_STOCK_PORT = Symbol('BundleStockPort');

// Cross-owner-domain port: bundle availableStock is owned by products.
// Inventory triggers fan-out via this port from inside its own transaction.
// The adapter implementation is the only inventory-side call site of products'
// owner-side bundle-stock port (ADR-0014 single-writer invariant).
export interface BundleStockPort {
  recomputeForComponent(
    organizationId: string,
    componentOptionId: string,
    tx: RepositoryTransaction,
  ): Promise<string[]>;
}
