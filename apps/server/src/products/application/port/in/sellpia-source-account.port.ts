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

  confirmSourceBinding(
    input: ProductActorScope & SellpiaInventorySourceBindingRequest,
  ): Promise<SellpiaInventoryCollectionStatusView>;
}
