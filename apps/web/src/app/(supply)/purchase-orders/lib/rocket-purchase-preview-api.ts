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
  return RocketWorkbookExportResponseSchema.parse(await response.json());
}

export async function getActiveRocketWorkbook(): Promise<RocketWorkbookExportResponse | null> {
  const response = await apiClient.post('/api/purchase-orders', {
    action: 'getActiveRocketWorkbook',
  });
  return response === null ? null : RocketWorkbookExportResponseSchema.parse(response);
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
  return RocketWorkbookExportResponseSchema.parse(response);
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
