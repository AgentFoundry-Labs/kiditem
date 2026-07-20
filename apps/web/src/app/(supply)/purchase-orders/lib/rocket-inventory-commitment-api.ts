import {
  RocketPurchaseCommitmentActionRequestSchema,
  RocketPurchaseCommitmentActionResponseSchema,
  RocketPurchaseCommitmentListRequestSchema,
  RocketPurchaseCommitmentListResponseSchema,
  type RocketPurchaseCommitmentActionRequest,
  type RocketPurchaseCommitmentActionResponse,
  type RocketPurchaseCommitmentListRequest,
  type RocketPurchaseCommitmentListResponse,
} from '@kiditem/shared/inventory-commitment';
import { apiClient } from '@/lib/api-client';

export async function listRocketInventoryCommitments(
  input: RocketPurchaseCommitmentListRequest,
): Promise<RocketPurchaseCommitmentListResponse> {
  const request = RocketPurchaseCommitmentListRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'listRocketCommitments',
    ...request,
  });
  return RocketPurchaseCommitmentListResponseSchema.parse(response);
}

export async function settleRocketFinalOrderCommitments(
  input: RocketPurchaseCommitmentActionRequest,
): Promise<RocketPurchaseCommitmentActionResponse> {
  return mutateFinalOrderCommitments(
    'settleRocketFinalOrderCommitments',
    input,
  );
}

export async function releaseRocketFinalOrderCommitments(
  input: RocketPurchaseCommitmentActionRequest,
): Promise<RocketPurchaseCommitmentActionResponse> {
  return mutateFinalOrderCommitments(
    'releaseRocketFinalOrderCommitments',
    input,
  );
}

async function mutateFinalOrderCommitments(
  action: 'settleRocketFinalOrderCommitments' | 'releaseRocketFinalOrderCommitments',
  input: RocketPurchaseCommitmentActionRequest,
): Promise<RocketPurchaseCommitmentActionResponse> {
  const request = RocketPurchaseCommitmentActionRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action,
    ...request,
  });
  return RocketPurchaseCommitmentActionResponseSchema.parse(response);
}
