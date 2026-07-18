import type {
  RocketPurchaseCommitmentActionRequest,
  RocketPurchaseCommitmentActionResponse,
  RocketPurchaseCommitmentListRequest,
  RocketPurchaseCommitmentListResponse,
} from '@kiditem/shared/inventory-commitment';

export interface RocketPurchaseCommitmentQueryPort {
  list(input: {
    organizationId: string;
    request: RocketPurchaseCommitmentListRequest;
  }): Promise<RocketPurchaseCommitmentListResponse>;

  settleFinalOrders(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseCommitmentActionRequest;
  }): Promise<RocketPurchaseCommitmentActionResponse>;

  releaseFinalOrders(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseCommitmentActionRequest;
  }): Promise<RocketPurchaseCommitmentActionResponse>;
}

export const ROCKET_PURCHASE_COMMITMENT_QUERY_PORT = Symbol(
  'ROCKET_PURCHASE_COMMITMENT_QUERY_PORT',
);
