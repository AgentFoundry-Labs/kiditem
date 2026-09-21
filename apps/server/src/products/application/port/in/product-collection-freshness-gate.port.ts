export const PRODUCT_COLLECTION_FRESHNESS_GATE_PORT = Symbol(
  'PRODUCT_COLLECTION_FRESHNESS_GATE_PORT',
);

/**
 * Exact-attempt proof for stock consumers.  The caller supplies the attempt
 * it just observed; Products verifies that generation before returning stock.
 */
export interface ProductCollectionFreshnessGatePort {
  requireCollectedStock(input: {
    organizationId: string;
    attemptId: string;
    masterProductIds: string[];
  }): Promise<{
    attemptId: string;
    fence: string;
    generation: string;
    completedAt: string;
    products: Array<{ masterProductId: string; currentStock: number }>;
  }>;
}
