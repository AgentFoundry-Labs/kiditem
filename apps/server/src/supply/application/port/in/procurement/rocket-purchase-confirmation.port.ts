import type {
  RocketPurchaseConfirmationRequest,
  RocketPurchaseConfirmationReleaseRequest,
  RocketPurchaseConfirmationResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketPurchaseConfirmationPort {
  confirm(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseConfirmationRequest;
  }): Promise<RocketPurchaseConfirmationResponse>;
  release(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchaseConfirmationReleaseRequest;
  }): Promise<RocketPurchaseConfirmationResponse>;
}

export const ROCKET_PURCHASE_CONFIRMATION_PORT = Symbol(
  'ROCKET_PURCHASE_CONFIRMATION_PORT',
);
