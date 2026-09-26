export const PRODUCT_COLLECTION_FRESHNESS_GATE_PORT = Symbol(
  'PRODUCT_COLLECTION_FRESHNESS_GATE_PORT',
);

/**
 * 재고 소비자를 위한 정확한 실행 증명. 호출자는 방금 본 셀피아 재고 실행(`products.sellpia_inventory`) id를 주고,
 * Products는 그 실행이 지금 발행된 세대인지 확인한 뒤 재고를 돌려준다.
 */
export interface ProductCollectionFreshnessGatePort {
  requireCollectedStock(input: {
    organizationId: string;
    operationId: string;
    masterProductIds: string[];
  }): Promise<{
    operationId: string;
    fence: string;
    generation: string;
    completedAt: string;
    products: Array<{ masterProductId: string; currentStock: number }>;
  }>;
}
