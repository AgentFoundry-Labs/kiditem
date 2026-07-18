import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  RocketPurchaseConfirmationRequestSchema,
  RocketPurchaseConfirmationReleaseRequestSchema,
  RocketPurchaseConfirmationResponseSchema,
  RocketSavedPoCollectionSchema,
  RocketSavedPoListRequestSchema,
  RocketSavedPoSummarySchema,
  type RocketPurchaseConfirmationRequest,
  type RocketPurchaseConfirmationReleaseRequest,
  type RocketPurchaseConfirmationResponse,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
  type RocketSavedPoCollection,
  type RocketSavedPoListRequest,
  type RocketSavedPoSummary,
} from '@kiditem/shared/rocket-purchase-preview';
import { apiClient } from '@/lib/api-client';
import { z } from 'zod';

const LoadSavedRocketCollectionRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
}).strict();

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

export async function listSavedRocketPos(
  input: RocketSavedPoListRequest,
): Promise<RocketSavedPoSummary[]> {
  const request = RocketSavedPoListRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'listSavedRocketPos',
    channelAccountId: request.channelAccountId,
    from: request.from,
    to: request.to,
    ...(request.status && { rocketStatus: request.status }),
  });
  return z.array(RocketSavedPoSummarySchema).parse(response);
}

export async function loadSavedRocketCollection(input: {
  channelAccountId: string;
  sourceImportRunId: string;
}): Promise<RocketSavedPoCollection> {
  const request = LoadSavedRocketCollectionRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'loadSavedRocketCollection',
    ...request,
  });
  return RocketSavedPoCollectionSchema.parse(response);
}
