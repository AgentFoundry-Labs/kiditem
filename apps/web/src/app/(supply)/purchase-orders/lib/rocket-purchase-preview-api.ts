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

/** 저장 수집본 상품을 셀피아 재고에 바코드로 매칭한 행. */
export const RocketStockMatchRowSchema = z.object({
  poLineId: z.string(),
  poNumber: z.string(),
  productName: z.string(),
  barcode: z.string(),
  orderQuantity: z.number(),
  plannedDeliveryDate: z.string(),
  matched: z.boolean(),
  matchType: z.enum(['barcode', 'name', 'name-fuzzy']).nullable(),
  sellpiaName: z.string().nullable(),
  currentStock: z.number().nullable(),
  activeCommitmentQuantity: z.number().nullable(),
  availableStock: z.number().nullable(),
  packSize: z.number(),
  confirmQuantity: z.number(),
});
export type RocketStockMatchRow = z.infer<typeof RocketStockMatchRowSchema>;
const RocketStockMatchResponseSchema = z.object({
  rows: z.array(RocketStockMatchRowSchema),
});

const MatchRocketStockRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

/**
 * 저장 수집본(sourceImportRunId)의 상품을 셀피아 재고에 매칭(read-only, 바코드→이름→퍼지).
 * fromDate/toDate 를 주면 그 입고예정일 범위만 매칭한다(전송량·비용 절감).
 */
export async function matchRocketStock(input: {
  channelAccountId: string;
  sourceImportRunId: string;
  fromDate?: string;
  toDate?: string;
}): Promise<RocketStockMatchRow[]> {
  const request = MatchRocketStockRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'matchRocketStock',
    ...request,
  });
  return RocketStockMatchResponseSchema.parse(response).rows;
}
