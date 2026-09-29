import type {
  SellpiaInventoryCollectionState,
  SellpiaInventoryCollectionStatePatch,
  SellpiaLatestOperation,
} from '../../../../domain/policy/product-source-freshness.policy';
import type { InventoryAvailabilityBatch } from '@kiditem/shared/inventory-availability';

export type ProductSourceStatePatch = SellpiaInventoryCollectionStatePatch;

export type ProductSourceStateExpectation = {
  freshnessFence: string;
  requestedGeneration?: bigint;
};

export interface ProductCollectionFreshnessRepositoryTransaction {
  getState(): Promise<SellpiaInventoryCollectionState>;

  compareAndSetState(input: {
    expected: ProductSourceStateExpectation;
    patch: ProductSourceStatePatch;
  }): Promise<SellpiaInventoryCollectionState>;

  findProductAvailability(
    masterProductIds: string[],
  ): Promise<InventoryAvailabilityBatch>;
}

export interface ProductCollectionFreshnessRepositoryPort {
  readState(
    organizationId: string,
  ): Promise<SellpiaInventoryCollectionState | null>;

  /**
   * 셀피아 세 kind(재고·매출·상품 손익)의 가장 최근 실행(멈춘 실행 제외). 실행 표는 common/operation의 읽기 함수로만
   * 읽는다(ADR-0025). 상태 보기의 도는 중·실패는 이것이 말한다(KID-355 정책 B).
   */
  readLatestSellpiaOperation(
    organizationId: string,
  ): Promise<SellpiaLatestOperation | null>;

  withLockedState<T>(
    input: {
      organizationId: string;
      createInitialState: () => SellpiaInventoryCollectionState;
    },
    operation: (
      transaction: ProductCollectionFreshnessRepositoryTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export const PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT = Symbol(
  'PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT',
);

/** Compatibility aliases used while callers move to Product contracts. */
export type SellpiaInventoryStatePatch = ProductSourceStatePatch;
export type SellpiaInventoryStateExpectation = ProductSourceStateExpectation;
export type SellpiaInventoryFreshnessRepositoryTransaction =
  ProductCollectionFreshnessRepositoryTransaction;
export type SellpiaInventoryFreshnessRepositoryPort =
  ProductCollectionFreshnessRepositoryPort;
export const SELLPIA_INVENTORY_FRESHNESS_REPOSITORY_PORT =
  PRODUCT_COLLECTION_FRESHNESS_REPOSITORY_PORT;
