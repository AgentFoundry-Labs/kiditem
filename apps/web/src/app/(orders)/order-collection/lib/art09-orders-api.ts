import { downloadBlob } from '@/lib/browser-download';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import type { OrderCollectionConversionResult } from './order-collection-api';
import type { OrderCollectionExtensionRun } from './order-collection-extension';

const ART09_HEADERS = [
  '쇼핑몰',
  '쇼핑몰번호',
  '주문번호',
  '품목별 주문번호',
  '배송메시지',
  '총 주문금액',
  '총 결제금액',
  '상품번호',
  '주문상품명',
  '주문상품명(옵션포함)',
  '수량',
  '판매가',
  '수령인',
  '수령인 휴대전화',
  '수령인 우편번호',
  '수령인 주소',
  '수령인 상세 주소',
  '결제구분',
  '결제수단',
  '발주일',
  '배송국가',
] as const;

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

export interface Art09CsvResult extends OrderCollectionConversionResult {
  orderNumbers: string[];
}

export async function collectArt09OrdersFromExtension(run?: OrderCollectionExtensionRun): Promise<Art09OrderRow[]> {
  const extensionId = run?.extensionId ?? await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. extensions/order-collector 를 Chrome 에 로드하고 zzogzzog1.cafe24.com 에 로그인한 뒤 다시 시도하세요.',
    );
  }

  const res = await sendToExtension<Art09CollectResponse>(
    extensionId,
    {
      action: 'collectArt09Orders',
      date: run?.date,
      runId: run?.runId ?? globalThis.crypto.randomUUID(),
    },
    190000,
  );

  if (!res?.success || !Array.isArray(res.rows)) {
    throw new Error(res?.error ?? '아트공구 주문 수집에 실패했습니다.');
  }

  return res.rows;
}

export async function collectArt09CsvFromExtension(
  options?: { download?: boolean; run?: OrderCollectionExtensionRun },
): Promise<Art09CsvResult> {
  const rows = await collectArt09OrdersFromExtension(options?.run);
  const csvRows = rows.map(rowToCsv);
  const csv = `\uFEFF${[ART09_HEADERS, ...csvRows].map(csvLine).join('\r\n')}\r\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const fileName = `zzogzzog1_${todayCompact()}_주문수집.csv`;
  if (options?.download !== false) downloadBlob(blob, fileName);

  const orderNumbers = distinctNonEmpty(rows.map((row) => row.orderId ?? ''));
  return {
    fileName,
    blob,
    previewRows: [Array.from(ART09_HEADERS), ...csvRows].slice(0, 24),
    sourceRows: orderNumbers.length,
    productRows: rows.length,
    outputRows: rows.length,
    skippedRows: 0,
    orderNumbers,
  };
}

function rowToCsv(row: Art09OrderRow): string[] {
  return [
    row.shopName ?? '한국어 쇼핑몰',
    row.shopNo ?? '1',
    row.orderId ?? '',
    row.orderItemId ?? '',
    row.message ?? '',
    row.totalOrderAmount ?? '****',
    row.totalPaymentAmount ?? '****',
    row.productNo ?? '',
    row.productName ?? '',
    row.productNameWithOption ?? row.productName ?? '',
    String(row.qty ?? ''),
    row.salePrice ?? '****',
    row.receiver ?? '',
    row.receiverPhone ?? '',
    row.receiverZip ?? '',
    row.receiverAddress ?? '',
    row.receiverAddressDetail ?? '',
    row.paymentType ?? 'T',
    row.paymentMethod ?? '',
    row.orderedAt ?? '',
    row.country ?? '',
  ];
}

function csvLine(row: readonly string[]): string {
  return row.map(csvCell).join(',');
}

function csvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function distinctNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
}

function todayCompact(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
