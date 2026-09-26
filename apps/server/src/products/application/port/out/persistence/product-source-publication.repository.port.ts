import type { OwnerTransaction } from '../../../../../common/owner-transaction';
import type { SellpiaInventoryPlanTrigger } from '../../../../domain/sellpia-inventory-operation';
import type { ParsedProductSourceRow } from '../source/sellpia-payload-decoder.port';

export type SellpiaSnapshotPublicationChanges = {
  createdProductCount: number;
  updatedProductCount: number;
  inactivatedProductCount: number;
  /** 발행 뒤 셀피아 원천 범위의 상품 수(빠져서 재고 0이 된 상품 포함). */
  productCount: number;
};

export type SellpiaSnapshotPublicationInput = {
  organizationId: string;
  operationId: string;
  trigger: SellpiaInventoryPlanTrigger | null;
  rows: ParsedProductSourceRow[];
};

export interface ProductSourcePublicationRepositoryPort {
  /** 호출자 트랜잭션(실행 finish) 안에서 발행한다. */
  publishSnapshot(
    transaction: OwnerTransaction,
    input: SellpiaSnapshotPublicationInput,
  ): Promise<SellpiaSnapshotPublicationChanges>;
}

export const PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT = Symbol(
  'PRODUCT_SOURCE_PUBLICATION_REPOSITORY_PORT',
);
