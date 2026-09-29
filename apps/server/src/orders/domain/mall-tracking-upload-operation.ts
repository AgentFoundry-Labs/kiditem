import { KiditemPreconditionError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  MALL_TRACKING_UPLOAD_CHUNK_KIND,
  MALL_TRACKING_UPLOAD_ROWS_MAX,
  MallTrackingUploadPlanSchema,
  MallTrackingUploadResultSchema,
  MallTrackingUploadRowResultSchema,
  MallTrackingUploadScopeSchema,
  type MallTrackingUploadMall,
  type MallTrackingUploadPlan,
  type MallTrackingUploadResult,
  type MallTrackingUploadRow,
  type MallTrackingUploadRowResult,
  type MallTrackingUploadScope,
} from '@kiditem/shared/orders-action-operations';
import { sellpiaProviderMatchesMall } from '@kiditem/shared/sellpia-providers';
import { z } from 'zod';
import {
  assertWithinTargets,
  parseActionInput,
  readActionChunkItems,
  readOperatorConfirmation,
} from './orders-action-operation-input';
import type { SellpiaTrackingRow } from './sellpia-shipment-tracking-operation';

/** 운영자 확인 본문(`confirm {result}`): 몰에서 올라간 것을 봤다. 칸이 없다 — 보고 없는 plan 행을 올라간 것으로 센다. */
export const MallTrackingOperatorConfirmationSchema = z.object({}).strict();
export type MallTrackingOperatorConfirmation = z.infer<typeof MallTrackingOperatorConfirmationSchema>;

export function mallTrackingUploadScope(scope: unknown): MallTrackingUploadScope {
  return parseActionInput(MallTrackingUploadScopeSchema, scope, 'invalid_scope');
}

export function readMallTrackingUploadPlan(plan: unknown): MallTrackingUploadPlan {
  return parseActionInput(MallTrackingUploadPlanSchema, plan, 'invalid_plan');
}

export function readMallTrackingOperatorConfirmation(result: unknown): MallTrackingOperatorConfirmation | null {
  return readOperatorConfirmation(result, MallTrackingOperatorConfirmationSchema);
}

/**
 * 셀피아 송장 조회 캡처의 전 몰 행 → 이 몰에 올릴 행. 판매처명은 몰↔판매처 표로 부분일치해 고르고(`sellpiaProviderMatchesMall`),
 * 같은 주문·송장번호는 한 번. 택배사는 셀피아 값 그대로 둔다(몰 코드 매핑은 site 어댑터). 0행이면 시작하지 않는다.
 */
export function mallTrackingUploadRows(
  capture: readonly SellpiaTrackingRow[],
  mallKey: MallTrackingUploadMall,
): MallTrackingUploadRow[] {
  const rows: MallTrackingUploadRow[] = [];
  const seen = new Set<string>();
  for (const row of capture) {
    if (!sellpiaProviderMatchesMall(row.provider, mallKey)) continue;
    const orderNo = row.ordNo.trim();
    const trackingNumber = row.invNo.trim();
    const key = `${orderNo}\u0000${trackingNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ orderNo, trackingNumber, courier: row.courier });
  }
  if (rows.length === 0) throw new KiditemPreconditionError('ORDERS_TRACKING_UPLOAD_NO_ROWS', { details: { mallKey } });
  if (rows.length > MALL_TRACKING_UPLOAD_ROWS_MAX) {
    throw new KiditemPreconditionError('ORDERS_TRACKING_UPLOAD_NO_ROWS', { details: { mallKey, reason: 'too_many_rows', count: rows.length } });
  }
  return rows;
}

/**
 * `upload_results` → result(행 상태의 합). 결과는 모두 plan 주문이어야 하고, 같은 주문은 마지막 보고가 이긴다. 보고 없는
 * plan 행은 실패 — 운영자 확인이면 몰에서 올라간 것을 본 것이라 올라감으로 센다.
 */
export function mallTrackingUploadResult(
  chunks: readonly OperationStagedChunk[],
  plan: MallTrackingUploadPlan,
  confirmation: MallTrackingOperatorConfirmation | null,
): MallTrackingUploadResult {
  const reported = readActionChunkItems(chunks, MALL_TRACKING_UPLOAD_CHUNK_KIND, MallTrackingUploadRowResultSchema);
  const planOrders = [...new Set(plan.rows.map((row) => row.orderNo))];
  assertWithinTargets(reported.map((row) => row.orderNo), planOrders, 'upload_result_outside_plan');
  const byOrder = new Map<string, MallTrackingUploadRowResult>();
  for (const row of reported) byOrder.set(row.orderNo, row);
  const rows = planOrders.map((orderNo): MallTrackingUploadRowResult =>
    byOrder.get(orderNo) ?? { orderNo, status: confirmation ? 'uploaded' : 'failed', mallMessage: null });
  const count = (status: MallTrackingUploadRowResult['status']) => rows.filter((row) => row.status === status).length;
  return MallTrackingUploadResultSchema.parse({
    uploaded: count('uploaded'),
    alreadyUploaded: count('already_uploaded'),
    notInList: count('not_in_list'),
    failed: count('failed'),
    rows,
  });
}
