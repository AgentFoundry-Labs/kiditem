import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import { apiClient } from '@/lib/api-client';

export async function previewRocketPurchases(
  input: RocketPurchasePreviewRequest,
  options?: { inventoryRequirement?: 'advisory' | 'fresh' },
): Promise<RocketPurchasePreviewResponse> {
  const request = RocketPurchasePreviewRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'previewRocket',
    ...(options?.inventoryRequirement && {
      inventoryRequirement: options.inventoryRequirement,
    }),
    ...request,
  });
  return RocketPurchasePreviewResponseSchema.parse(response);
}
