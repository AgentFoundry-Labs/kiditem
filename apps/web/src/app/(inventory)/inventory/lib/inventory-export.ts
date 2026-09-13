import {
  fetchAllSellpiaInventorySkus,
  type SellpiaInventorySkuListParams,
} from '../../_shared/inventory-api';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { downloadBlob } from '@/lib/browser-download';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

export async function fetchAllInventoryForExport(
  params: Omit<SellpiaInventorySkuListParams, 'page' | 'limit'>,
): Promise<InventorySkuSnapshotItem[]> {
  return fetchAllSellpiaInventorySkus(params);
}

export async function downloadSellpiaInventoryExport(
  params: Omit<SellpiaInventorySkuListParams, 'page' | 'limit'>,
): Promise<void> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  const path = `/api/inventory/sellpia-skus/export${query ? `?${query}` : ''}`;
  const response = await apiClient.fetchRaw(path);
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Preserve the HTTP status when the server did not return JSON.
    }
    const record = body as Record<string, unknown> | null;
    const detail = typeof record?.message === 'string'
      ? record.message
      : '재고 엑셀 내보내기에 실패했습니다.';
    throw new ApiError(response.status, typeof record?.error === 'string' ? record.error : null, detail);
  }

  const blob = await response.blob();
  downloadBlob(
    blob,
    fileNameFromContentDisposition(response.headers.get('Content-Disposition'))
      ?? `Sellpia_현재재고_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
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
