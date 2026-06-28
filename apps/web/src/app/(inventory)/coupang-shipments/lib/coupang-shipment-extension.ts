'use client';

import {
  detectOrderCollectionExtensionId,
  sendToExtension,
} from '@/lib/extension-bridge';
import { COUPANG_SHIPMENT_PAGE_URL } from './coupang-shipment-files';

export interface CoupangShipmentDownloadRow {
  shipmentId: string;
  outboundAt: string;
  inboundDate: string;
  center: string;
  labelClicked: boolean;
  statementClicked: boolean;
}

export interface CoupangShipmentDownloadResult {
  success: boolean;
  url?: string;
  rows?: CoupangShipmentDownloadRow[];
  labelCount?: number;
  statementCount?: number;
  error?: string;
}

export async function openCoupangShipmentPageViaExtension(): Promise<string> {
  const extensionId = await getOrderCollectorExtensionId();
  const response = await sendToExtension<CoupangShipmentDownloadResult>(
    extensionId,
    { action: 'openCoupangShipmentPage', url: COUPANG_SHIPMENT_PAGE_URL },
    20000,
  );
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 쉽먼트 화면을 열지 못했습니다.');
  }
  return response.url ?? COUPANG_SHIPMENT_PAGE_URL;
}

export async function clickCoupangShipmentDownloadsViaExtension(params: {
  date?: string;
  labels: boolean;
  statements: boolean;
}): Promise<CoupangShipmentDownloadResult> {
  const extensionId = await getOrderCollectorExtensionId();
  const response = await sendToExtension<CoupangShipmentDownloadResult>(
    extensionId,
    {
      action: 'clickCoupangShipmentDownloads',
      date: params.date,
      labels: params.labels,
      statements: params.statements,
    },
    120000,
  );
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 쉽먼트 다운로드 실행에 실패했습니다.');
  }
  return response;
}

async function getOrderCollectorExtensionId(): Promise<string> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error('주문수집 확장프로그램이 필요합니다. extensions/order-collector를 Chrome에서 로드한 뒤 다시 시도해주세요.');
  }
  return extensionId;
}
