import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  RocketWorkbookAbandonRequestSchema,
  RocketWorkbookExportRequestSchema,
  RocketWorkbookExportResponseSchema,
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
  type RocketWorkbookAbandonRequest,
  type RocketWorkbookExportRequest,
  type RocketWorkbookExportResponse,
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

/** Legacy server fallback during a rolling deploy. New servers return a
 * `freshness_pending` checkpoint and the workflow performs the actual wait. */
export function rocketPreviewErrorMessage(cause: unknown, fallback: string): string {
  if (isApiError(cause) && cause.code === 'SELLPIA_SYNC_REQUIRED') {
    return '셀피아 재고 스냅샷이 최신이 아니어서 납품 수량을 계산할 수 없습니다.'
      + ' 주문 수집 결과는 보존되므로 셀피아 상태를 확인한 뒤 저장된 수집본으로 다시 시도해 주세요.';
  }
  return friendlyError(cause) ?? fallback;
}

export async function previewRocketPurchases(
  input: RocketPurchasePreviewRequest,
): Promise<RocketPurchasePreviewResponse> {
  const request = RocketPurchasePreviewRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'previewRocket',
    ...request,
  });
  return parseRocketResponse(
    'previewRocket',
    RocketPurchasePreviewResponseSchema,
    response,
  );
}

export async function exportRocketWorkbook(
  input: RocketWorkbookExportRequest,
  workbook: Blob,
): Promise<RocketWorkbookExportResponse> {
  const request = RocketWorkbookExportRequestSchema.parse(input);
  const formData = new FormData();
  formData.append('action', 'exportRocketWorkbook');
  formData.append('requestJson', JSON.stringify(request));
  formData.append('workbook', workbook, request.artifactFileName);
  const response = await apiClient.fetchRaw('/api/purchase-orders', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) throw new Error(await response.text());
  return parseRocketResponse(
    'exportRocketWorkbook',
    RocketWorkbookExportResponseSchema,
    await response.json(),
  );
}

export async function getActiveRocketWorkbook(): Promise<RocketWorkbookExportResponse | null> {
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'getActiveRocketWorkbook',
  });
  if (isEmptyResponse(response)) return null;
  return parseRocketResponse(
    'getActiveRocketWorkbook',
    RocketWorkbookExportResponseSchema,
    response,
  );
}

export async function downloadRocketWorkbook(exportId: string): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const parsedExportId = z.string().uuid().parse(exportId);
  const response = await apiClient.fetchRaw('/api/purchase-orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'downloadRocketWorkbook',
      exportId: parsedExportId,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return {
    blob: await response.blob(),
    fileName: fileNameFromContentDisposition(
      response.headers.get('Content-Disposition'),
    ) ?? `쿠팡_로켓_${parsedExportId}.xlsx`,
  };
}

export async function abandonRocketWorkbook(
  input: RocketWorkbookAbandonRequest,
): Promise<RocketWorkbookExportResponse> {
  const request = RocketWorkbookAbandonRequestSchema.parse(input);
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'abandonRocketWorkbook',
    exportId: request.exportId,
    abandonReason: request.reason,
  });
  return parseRocketResponse(
    'abandonRocketWorkbook',
    RocketWorkbookExportResponseSchema,
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

function isEmptyResponse(response: unknown): boolean {
  return response == null
    || (typeof response === 'object'
      && !Array.isArray(response)
      && Object.keys(response).length === 0);
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

function fileNameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? null;
}
