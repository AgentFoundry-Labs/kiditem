import type {
  SellpiaInventoryFreshnessView,
  SellpiaInventorySourceBindingRequest,
} from '@kiditem/shared/sellpia-inventory-freshness';

type ActorScope = { organizationId: string; userId: string };

export interface SellpiaInventoryFreshnessPort {
  getState(input: ActorScope): Promise<SellpiaInventoryFreshnessView>;

  confirmSourceBinding(
    input: ActorScope & SellpiaInventorySourceBindingRequest,
  ): Promise<SellpiaInventoryFreshnessView>;

}

export const SELLPIA_INVENTORY_FRESHNESS_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_PORT',
);
