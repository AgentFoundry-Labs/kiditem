import type {
  SellpiaInventoryCollectionStatusView,
  SellpiaInventorySourceBindingRequest,
} from '@kiditem/shared/sellpia-inventory-freshness';

export const SELLPIA_SOURCE_ACCOUNT_PORT = Symbol('SELLPIA_SOURCE_ACCOUNT_PORT');

export type ProductActorScope = {
  organizationId: string;
  userId: string;
};

/** Sellpia account/state binding; product source correction has its own port. */
export interface SellpiaSourceAccountPort {
  getCollectionState(
    input: ProductActorScope,
  ): Promise<SellpiaInventoryCollectionStatusView>;

  /** 셀피아 계정 연결을 운영자가 확인했는가(재고 실행 plan이 시작 전에 본다). */
  isSourceBindingConfirmed(organizationId: string): Promise<boolean>;

  confirmSourceBinding(
    input: ProductActorScope & SellpiaInventorySourceBindingRequest,
  ): Promise<SellpiaInventoryCollectionStatusView>;
}
