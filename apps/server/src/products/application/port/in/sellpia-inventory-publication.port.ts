import type { SellpiaInventoryResult } from '@kiditem/shared/sellpia-operations';
import type { SellpiaInventoryBrowserSnapshot } from '@kiditem/shared/source-import';
import type { OwnerTransaction } from '../../../../common/owner-transaction';
import type { SellpiaInventoryPlanTrigger } from '../../../domain/sellpia-inventory-operation';

export const SELLPIA_INVENTORY_PUBLICATION_PORT = Symbol('SELLPIA_INVENTORY_PUBLICATION_PORT');

/**
 * 셀피아 재고 실행(`products.sellpia_inventory`)의 발행 문. 실행 계약의 finish 트랜잭션(`transaction`) 안에서 스냅샷을
 * 검증·복호화하고 MasterProduct와 SellpiaInventoryState를 한 번에 쓴다. 트랜잭션을 열거나 커밋하지 않는다.
 */
export interface SellpiaInventoryPublicationPort {
  publish(transaction: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    trigger: SellpiaInventoryPlanTrigger | null;
    snapshot: SellpiaInventoryBrowserSnapshot;
  }): Promise<SellpiaInventoryResult>;
}
