import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
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
