import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  COUPANG_SHIPMENT_LIST_CHUNK_KIND,
  COUPANG_SHIPMENT_LIST_MAX_PAGES,
  COUPANG_SHIPMENT_LIST_ROWS_MAX,
  COUPANG_SHIPMENT_LIST_STOP_REASONS,
  CoupangShipmentListPlanSchema,
  CoupangShipmentListResultSchema,
  CoupangShipmentListRowSchema,
  CoupangShipmentListScopeSchema,
  type CoupangShipmentListPlan,
  type CoupangShipmentListResult,
  type CoupangShipmentListRow,
} from '@kiditem/shared/orders-action-operations';
import { z } from 'zod';
import { invalidActionInput, parseActionInput, readActionChunkItems } from './orders-action-operation-input';

/** finish 요청 `result`에서 읽는 칸: 몇 쪽을 읽었고 왜 멈췄는가. 청크(행 배열)에는 실을 곳이 없다. */
const ShipmentListFinishSchema = z.object({
  scannedPages: z.number().int().min(1),
  stopReason: z.enum(COUPANG_SHIPMENT_LIST_STOP_REASONS),
}).passthrough();

/** scope `{date}` → plan `{date, maxPages: 60}`(옛 목록 스크립트의 쪽 상한). */
export function coupangShipmentListPlan(scope: unknown): CoupangShipmentListPlan {
  const { date } = parseActionInput(CoupangShipmentListScopeSchema, scope, 'invalid_scope');
  return CoupangShipmentListPlanSchema.parse({ date, maxPages: COUPANG_SHIPMENT_LIST_MAX_PAGES });
}

export function readCoupangShipmentListPlan(plan: unknown): CoupangShipmentListPlan {
  return parseActionInput(CoupangShipmentListPlanSchema, plan, 'invalid_plan');
}

/**
 * `shipment_rows` → result. 같은 seq는 처음 행 하나(옛 규칙). 발송일이 적힌 행은 plan 발송일이어야 하고, 읽은 쪽 수는 plan
 * 상한 안이어야 한다. 행이 상한(2,000)을 넘으면 거절한다.
 */
export function coupangShipmentListResult(
  chunks: readonly OperationStagedChunk[],
  plan: CoupangShipmentListPlan,
  finishResult: unknown,
): CoupangShipmentListResult {
  const finish = parseActionInput(ShipmentListFinishSchema, finishResult, 'invalid_finish_result');
  if (finish.scannedPages > plan.maxPages) throw invalidActionInput('scanned_pages_over_plan', { scannedPages: finish.scannedPages, maxPages: plan.maxPages });
  const shipments: CoupangShipmentListRow[] = [];
  const seen = new Set<string>();
  for (const row of readActionChunkItems(chunks, COUPANG_SHIPMENT_LIST_CHUNK_KIND, CoupangShipmentListRowSchema)) {
    if (row.outbound !== null && row.outbound !== plan.date) throw invalidActionInput('outbound_outside_plan', { seq: row.seq, outbound: row.outbound });
    if (seen.has(row.seq)) continue;
    seen.add(row.seq);
    shipments.push(row);
  }
  if (shipments.length > COUPANG_SHIPMENT_LIST_ROWS_MAX) throw invalidActionInput('too_many_shipments', { count: shipments.length });
  return CoupangShipmentListResultSchema.parse({ date: plan.date, shipments, scannedPages: finish.scannedPages, stopReason: finish.stopReason });
}
