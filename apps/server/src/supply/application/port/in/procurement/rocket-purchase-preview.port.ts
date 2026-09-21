import type {
  RocketPurchasePreviewRequest,
  RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';

export interface RocketPurchasePreviewPort {
  preview(input: {
    organizationId: string;
    userId: string;
    request: RocketPurchasePreviewRequest;
  }): Promise<RocketPurchasePreviewResponse>;
}

export const ROCKET_PURCHASE_PREVIEW_PORT = Symbol(
  'ROCKET_PURCHASE_PREVIEW_PORT',
);
