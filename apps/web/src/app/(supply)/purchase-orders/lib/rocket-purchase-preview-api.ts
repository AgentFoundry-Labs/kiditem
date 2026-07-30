import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  RocketSavedPoCollectionSchema,
  RocketSavedPoSnapshotSchema,
  RocketSavedPoListRequestSchema,
  RocketSavedPoSummarySchema,
  ROCKET_SAVED_PO_RESPONSE_PROFILE,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
  type RocketSavedPoCollection,
  type RocketSavedPoListRequest,
  type RocketSavedPoSummary,
} from '@kiditem/shared/rocket-purchase-preview';
import { z, type ZodType } from 'zod';
import { apiClient } from '@/lib/api-client';
import { friendlyError, isApiError } from '@/lib/api-error';

const LoadSavedRocketCollectionRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
}).strict();

const ROCKET_SAVED_PO_PROFILE_HEADERS = {
  'X-KidItem-Response-Profile': ROCKET_SAVED_PO_RESPONSE_PROFILE,
} as const;

/** Compatibility copy for an older server that still freshness-gates preview.
 * The collected source remains saved, but this client never polls or triggers
 * inventory synchronization before showing an advisory preview. */
export function rocketPreviewErrorMessage(cause: unknown, fallback: string): string {
  if (isApiError(cause) && cause.code === 'SELLPIA_SYNC_REQUIRED') {
    return '셀피아 재고 스냅샷이 최신이 아니어서 납품 수량을 계산할 수 없습니다.'
      + ' 주문 수집 결과는 보존되므로 셀피아 상태를 확인한 뒤 저장된 수집본으로 다시 시도해 주세요.';
  }
  return friendlyError(cause) ?? fallback;
}

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
  return parseRocketResponse(
    'previewRocket',
    RocketPurchasePreviewResponseSchema,
    response,
  );
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
  }, { headers: ROCKET_SAVED_PO_PROFILE_HEADERS });
  return parseRocketResponse(
    'listSavedRocketPos',
    z.array(RocketSavedPoSummarySchema),
    response,
  );
}

export async function loadSavedRocketCollection(input: {
  channelAccountId: string;
  sourceImportRunId: string;
}): Promise<RocketSavedPoCollection> {
  const request = LoadSavedRocketCollectionRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'loadSavedRocketCollection',
    ...request,
  }, { headers: ROCKET_SAVED_PO_PROFILE_HEADERS });
  const parsed = parseRocketResponse(
    'loadSavedRocketCollection',
    z.union([RocketSavedPoCollectionSchema, RocketSavedPoSnapshotSchema]),
    response,
  );
  return 'exportedPoLineIds' in parsed
    ? parsed
    : { ...parsed, exportedPoLineIds: [] };
}

function parseRocketResponse<T>(
  action: string,
  schema: ZodType<T>,
  response: unknown,
): T {
  const parsed = schema.safeParse(response);
  if (parsed.success) return parsed.data;
  console.error('[rocket-purchase-preview-api] Invalid response', {
    action,
    issues: parsed.error.issues.map(({ code, message, path }) => ({
      code,
      message,
      path,
    })),
  });
  throw parsed.error;
}
