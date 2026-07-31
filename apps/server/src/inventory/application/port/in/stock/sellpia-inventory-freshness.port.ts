import type {
  SellpiaInventoryClaimResponse,
  SellpiaInventoryCollectionFailureCode,
  SellpiaInventoryFreshnessView,
  SellpiaInventoryRefreshRequest,
  SellpiaInventorySourceBindingRequest,
} from '@kiditem/shared/sellpia-inventory-freshness';

type ActorScope = { organizationId: string; userId: string };
type ClaimScope = ActorScope & { claimToken: string };

export interface SellpiaInventoryFreshnessPort {
  getState(input: ActorScope): Promise<SellpiaInventoryFreshnessView>;

  confirmSourceBinding(
    input: ActorScope & SellpiaInventorySourceBindingRequest,
  ): Promise<SellpiaInventoryFreshnessView>;

  requestRefresh(
    input: ActorScope & SellpiaInventoryRefreshRequest,
  ): Promise<SellpiaInventoryFreshnessView>;

  claimDue(input: ActorScope): Promise<SellpiaInventoryClaimResponse>;

  heartbeat(input: ClaimScope): Promise<SellpiaInventoryFreshnessView>;

  fail(
    input: ClaimScope & {
      errorCode: SellpiaInventoryCollectionFailureCode;
      errorMessage: string;
    },
  ): Promise<SellpiaInventoryFreshnessView>;

  cancel(input: ClaimScope): Promise<SellpiaInventoryFreshnessView>;
}

export const SELLPIA_INVENTORY_FRESHNESS_PORT = Symbol(
  'SELLPIA_INVENTORY_FRESHNESS_PORT',
);
