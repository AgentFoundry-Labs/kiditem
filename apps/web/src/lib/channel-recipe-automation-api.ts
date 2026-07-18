import {
  ApplyChannelRecipeAutomationInputSchema,
  ApplyChannelRecipeAutomationResponseSchema,
  ChannelRecipeAutomationPreviewSchema,
  type ApplyChannelRecipeAutomationInput,
  type ApplyChannelRecipeAutomationResponse,
  type ChannelRecipeAutomationPreview,
} from '@kiditem/shared/channel-recipe-automation';
import { apiClient } from '@/lib/api-client';

export function getChannelRecipeAutomationPreview(
  channelAccountId: string,
): Promise<ChannelRecipeAutomationPreview> {
  return apiClient.getParsed(
    `/api/channels/product-mappings/recipe-automation/preview?channelAccountId=${encodeURIComponent(channelAccountId)}`,
    ChannelRecipeAutomationPreviewSchema,
  );
}

export async function applyChannelRecipeAutomation(
  input: ApplyChannelRecipeAutomationInput,
): Promise<ApplyChannelRecipeAutomationResponse> {
  const response = await apiClient.post<unknown>(
    '/api/channels/product-mappings/recipe-automation/apply',
    ApplyChannelRecipeAutomationInputSchema.parse(input),
  );
  return ApplyChannelRecipeAutomationResponseSchema.parse(response);
}
