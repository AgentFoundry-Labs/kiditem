import type {
  SellpiaInventoryCollectionStatusView,
  SellpiaInventorySourceBindingRequest,
} from '@kiditem/shared/sellpia-inventory-freshness';

type ActorScope = { organizationId: string; userId: string };

export interface SellpiaInventoryCollectionStatusPort {
  getState(input: ActorScope): Promise<SellpiaInventoryCollectionStatusView>;

  confirmSourceBinding(
    input: ActorScope & SellpiaInventorySourceBindingRequest,
  ): Promise<SellpiaInventoryCollectionStatusView>;

}

export const SELLPIA_INVENTORY_COLLECTION_STATUS_PORT = Symbol(
  'SELLPIA_INVENTORY_COLLECTION_STATUS_PORT',
);
