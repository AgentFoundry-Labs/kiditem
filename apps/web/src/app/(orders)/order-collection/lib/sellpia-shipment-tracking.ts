'use client';

import { z } from 'zod';
import { SELLPIA_SHIPMENT_TRACKING_KIND } from '@kiditem/shared/orders-operations';
import { apiClient } from '@/lib/api-client';
import type { SellpiaTrackingRow } from './icecream-tracking-api';
import { startOrderOperation, waitForOrderOperation } from './order-operations';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 보관 캡처(서버 finalize가 만든 JSON). 옛 attempt 완료 본문과 같은 모양이다. */
const SellpiaShipmentTrackingCaptureSchema = z.object({
  rows: z.array(z.object({
    ordNo: z.string(),
    itemNo: z.string(),
    invNo: z.string(),
    courier: z.string(),
    provider: z.string(),
    receiver: z.string().optional(),
    post: z.string().optional(),
    addr: z.string().optional(),
  }).strict()),
  total: z.number().int().nonnegative(),
  range: z.object({ start: isoDay, end: isoDay }).strict(),
  confirmedRange: z.null().default(null),
}).strict();

/** 성공한 셀피아 송장 조회 실행의 송장 행(`GET /api/orders/sellpia-shipment-tracking/:operationId/source`). */
export async function readSellpiaShipmentTrackingRows(
  operationId: string,
  expected: { startDate: string; endDate: string },
): Promise<SellpiaTrackingRow[]> {
  const response = await apiClient.fetchRaw(`/api/orders/sellpia-shipment-tracking/${encodeURIComponent(operationId)}/source`);
  if (!response.ok) throw new Error(`셀피아 송장 원본을 읽지 못했습니다 (${response.status}).`);
  const capture = SellpiaShipmentTrackingCaptureSchema.parse(await response.json());
  if (capture.range.start !== expected.startDate || capture.range.end !== expected.endDate) {
    throw new Error('셀피아 송장 원본의 조회 기간이 요청과 다릅니다.');
  }
  return capture.rows;
}

/**
 * 셀피아 송장 조회(실행 kind `orders.sellpia_shipment_tracking`, KID-359 H3). 확장에 그날 하루 조회를 시작시키고,
 * 끝날 때까지 실행 reader를 본 뒤 보관 캡처에서 송장 행을 읽는다. 누를 때마다 새로 조회한다.
 */
export async function collectSellpiaShipmentTracking(
  date: string,
  options: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<SellpiaTrackingRow[]> {
  const scope = { startDate: date, endDate: date };
  const operationId = await startOrderOperation(SELLPIA_SHIPMENT_TRACKING_KIND, scope);
  await waitForOrderOperation(SELLPIA_SHIPMENT_TRACKING_KIND, operationId, {
    source: 'sellpia_shipment_tracking',
    ...(options.sleep ? { sleep: options.sleep } : {}),
  });
  return readSellpiaShipmentTrackingRows(operationId, scope);
}
