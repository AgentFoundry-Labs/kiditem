import type {
  RocketPurchaseConfirmationRequest,
  RocketPurchaseConfirmationResponse,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketPurchaseConfirmationTransactionPort {
  confirm(input: {
    organizationId: string;
    userId: string;
    sourceImportRunId: string;
    request: RocketPurchaseConfirmationRequest;
    preview: RocketPurchasePreviewResponse;
  }): Promise<RocketPurchaseConfirmationResponse>;
  release(input: {
    organizationId: string;
    userId: string;
    confirmationId: string;
    reason: string;
  }): Promise<RocketPurchaseConfirmationResponse>;
}

export const ROCKET_PURCHASE_CONFIRMATION_TRANSACTION_PORT = Symbol(
  'ROCKET_PURCHASE_CONFIRMATION_TRANSACTION_PORT',
);
