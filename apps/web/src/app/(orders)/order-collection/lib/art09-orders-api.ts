import { apiClient } from '@/lib/api-client';
import { downloadBlob } from '@/lib/browser-download';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { OrderCollectionConversionResult } from './order-collection-api';
import {
  orderCollectionExtensionRunFields,
  type OrderCollectionExtensionRun,
} from './order-collection-extension';

export interface Art09OrderRow {
  shopName?: string;
  shopNo?: string;
  orderId?: string;
  orderItemId?: string;
  message?: string;
  totalOrderAmount?: string;
  totalPaymentAmount?: string;
  productNo?: string;
  productName?: string;
  productNameWithOption?: string;
  qty?: string | number;
  salePrice?: string;
  receiver?: string;
  receiverPhone?: string;
  receiverZip?: string;
  receiverAddress?: string;
  receiverAddressDetail?: string;
  paymentType?: string;
  paymentMethod?: string;
  orderedAt?: string;
  country?: string;
}

interface Art09CollectResponse {
  success?: boolean;
  rows?: Art09OrderRow[];
  count?: number;
  orderCount?: number;
  error?: string;
}

export async function collectArt09OrdersFromExtension(run?: OrderCollectionExtensionRun): Promise<Art09OrderRow[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 zzogzzog1.cafe24.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }

  const res = await sendToExtension<Art09CollectResponse>(
    extensionId,
    {
      action: 'collectArt09Orders',
      date: run?.date,
      // attemptId/deferTerminal: true are included by shared fenced run fields.
      ...orderCollectionExtensionRunFields(run),
    },
    190000,
  );

  if (!res?.success || !Array.isArray(res.rows)) {
    throw new Error(res?.error ?? '아트공구 주문 수집에 실패했습니다.');
  }

  return res.rows.filter(isValidArt09OrderRow);
}

/** Server-owned Art09 conversion; the CSV response remains an immediate download. */
export async function convertArt09ToSellpiaFile(
  rows: Art09OrderRow[],
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<OrderCollectionConversionResult> {
  const response = await apiClient.fetchRaw('/api/orders/collection/art09/convert', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options?.run ? {
        'x-order-collection-attempt-id': options.run.attemptId,
        'x-source-attempt-token': options.run.attemptToken,
      } : {}),
    },
    body: JSON.stringify({ rows }),
  });
  if (!response.ok) {
    throw new Error((await response.text().catch(() => '')) || '아트공구 변환에 실패했습니다.');
  }
  const blob = await response.blob();
  const fileName = fileNameFromContentDisposition(response.headers.get('Content-Disposition'))
    ?? `zzogzzog1_${todayCompact()}_주문수집.csv`;
  if (options?.download !== false) downloadBlob(blob, fileName);
  return {
    fileName,
    blob,
    previewRows: await readCsvPreviewRows(blob),
    sourceRows: numericHeader(response, 'X-Order-Collection-Source-Rows'),
    productRows: numericHeader(response, 'X-Order-Collection-Product-Rows'),
    outputRows: numericHeader(response, 'X-Order-Collection-Output-Rows'),
    skippedRows: numericHeader(response, 'X-Order-Collection-Skipped-Rows'),
  };
}

function isValidArt09OrderRow(row: Art09OrderRow): boolean {
  const orderId = row.orderId?.trim() ?? '';
  const orderItemId = row.orderItemId?.trim() ?? '';
  const quantity = Number(row.qty);
  return /^\d{8}-\d{7}$/.test(orderId)
    && (!orderItemId || new RegExp(`^${orderId}-\\d{2,}$`).test(orderItemId))
    && Boolean(row.productName?.trim())
    && Number.isFinite(quantity)
    && quantity > 0;
}

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

async function readCsvPreviewRows(blob: Blob): Promise<string[][]> {
  const text = await blob.text();
  return parseCsvRows(text.replace(/^\uFEFF/, ''), 24);
}

function parseCsvRows(text: string, limit: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const pushRow = () => {
    if (row.length === 0 && cell.length === 0) return;
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
  };

  for (let index = 0; index < text.length && rows.length < limit; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      cell += character;
    }
  }

  if (rows.length < limit && (row.length > 0 || cell.length > 0)) pushRow();
  return rows;
}

function todayCompact(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
