import {
  RocketPurchasePreviewRequestSchema,
  RocketPurchasePreviewResponseSchema,
  RocketWorkbookAbandonRequestSchema,
  RocketWorkbookExportRequestSchema,
  RocketWorkbookExportResponseSchema,
  RocketSavedPoCollectionSchema,
  RocketSavedPoListRequestSchema,
  RocketSavedPoSummarySchema,
  type RocketPurchasePreviewRequest,
  type RocketPurchasePreviewResponse,
  type RocketSavedPoCollection,
  type RocketSavedPoListRequest,
  type RocketSavedPoSummary,
  type RocketWorkbookAbandonRequest,
  type RocketWorkbookExportRequest,
  type RocketWorkbookExportResponse,
} from '@kiditem/shared/rocket-purchase-preview';
import { apiClient } from '@/lib/api-client';
import { friendlyError, isApiError } from '@/lib/api-error';
import { z, type ZodType } from 'zod';

const LoadSavedRocketCollectionRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  sourceImportRunId: z.string().uuid(),
}).strict();

/**
 * 로켓 미리보기 실패 문구. 서버는 `SELLPIA_SYNC_REQUIRED` 를 영문 "…before purchase." 로 던지는데,
 * 미리보기는 구매가 아니라 읽기이므로 운영자에게는 원인과 다음 조치를 한국어로 알려준다.
 * 미리보기 수량은 그대로 워크북 발주 수량이 되므로 stale 재고로 계산해 보여줄 수는 없다(게이트 유지).
 */
export function rocketPreviewErrorMessage(cause: unknown, fallback: string): string {
  if (isApiError(cause) && cause.code === 'SELLPIA_SYNC_REQUIRED') {
    return '셀피아 재고 스냅샷이 최신이 아니어서 납품 수량을 계산할 수 없습니다.'
      + ' 주문수집 화면에서 확정되지 않은 셀피아 전송 건이 있으면 먼저 처리한 뒤,'
      + ' 재고 동기화가 끝나면 자동으로 다시 계산됩니다.';
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
  });
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
  });
  return parseRocketResponse(
    'loadSavedRocketCollection',
    RocketSavedPoCollectionSchema,
    response,
  );
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
