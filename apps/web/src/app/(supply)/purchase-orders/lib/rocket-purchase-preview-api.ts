import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  RocketPurchaseConfirmationRequestSchema,
  RocketPurchaseConfirmationReleaseRequestSchema,
  RocketPurchaseConfirmationResponseSchema,
  type RocketPurchaseConfirmationRequest,
  type RocketPurchaseConfirmationReleaseRequest,
  type RocketPurchaseConfirmationResponse,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import { apiClient } from '@/lib/api-client';

export async function previewRocketPurchases(
  input: RocketPurchasePreviewRequest,
): Promise<RocketPurchasePreviewResponse> {
  const request = RocketPurchasePreviewRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'previewRocket',
    ...request,
  });
  return RocketPurchasePreviewResponseSchema.parse(response);
}

export async function confirmRocketPurchase(
  input: RocketPurchaseConfirmationRequest,
): Promise<RocketPurchaseConfirmationResponse> {
  const request = RocketPurchaseConfirmationRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'confirmRocket',
    ...request,
  });
  return RocketPurchaseConfirmationResponseSchema.parse(response);
}

export async function releaseRocketPurchaseConfirmation(
  input: RocketPurchaseConfirmationReleaseRequest,
): Promise<RocketPurchaseConfirmationResponse> {
  const request = RocketPurchaseConfirmationReleaseRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'releaseRocketConfirmation',
    confirmationId: request.confirmationId,
    releaseReason: request.reason,
  });
  return RocketPurchaseConfirmationResponseSchema.parse(response);
}
