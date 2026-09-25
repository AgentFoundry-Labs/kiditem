import { inclusiveDayCount, parseBusinessDate } from '@kiditem/shared/common';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk, OperationWindow } from '@kiditem/shared/operation';
import {
  SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND,
  SellpiaShipmentTrackingScopeSchema,
  type SellpiaShipmentTrackingScope,
} from '@kiditem/shared/orders-operations';
import { z } from 'zod';

/** 한 번에 조회하는 기간의 상한: 양 끝을 넣어 31일(시작일과 끝일이 30일 넘게 벌어지지 않는다, 옛 attempt 규칙 그대로). */
const MAX_WINDOW_DAYS = 31;

/**
 * 셀피아 송장 한 줄(`delivery_link.action.html`의 `list[]`를 확장이 줄인 모양). 판매처 필터는 화면이 몰별로 한다 —
 * 캡처는 전 몰 송장이다. 받는 사람·우편번호·주소는 옛 캡처에 없던 적이 있어 선택이다.
 */
export const SellpiaTrackingRowSchema = z.object({
  ordNo: z.string().trim().min(1).max(200),
  itemNo: z.string().max(200),
  invNo: z.string().trim().min(1).max(200),
  courier: z.string().max(100),
  provider: z.string().max(300),
  receiver: z.string().max(300).optional(),
  post: z.string().max(40).optional(),
  addr: z.string().max(1_000).optional(),
}).strict();
export type SellpiaTrackingRow = z.infer<typeof SellpiaTrackingRowSchema>;

export interface SellpiaTrackingPlan {
  startDate: string;
  endDate: string;
}

/**
 * 보관 캡처(`OrderCollectionArtifact`)의 JSON — 옛 attempt 완료 본문과 같은 모양이라 송장 화면이 그대로 읽는다.
 * `total`은 보관한 줄 수, `confirmedRange`는 셀피아가 따로 확인해 준 기간이 없어 늘 null이다.
 */
export interface SellpiaTrackingCapture {
  rows: SellpiaTrackingRow[];
  total: number;
  range: { start: string; end: string };
  confirmedRange: null;
}

/** scope → plan. 실제 달력 날짜이고 31일 안이어야 한다. */
export function sellpiaTrackingPlan(scope: unknown): SellpiaTrackingPlan {
  const parsed = SellpiaShipmentTrackingScopeSchema.safeParse(scope);
  if (!parsed.success) {
    throw invalid('invalid_scope', { errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })) });
  }
  const { startDate, endDate }: SellpiaShipmentTrackingScope = parsed.data;
  const start = parseBusinessDate(startDate);
  const end = parseBusinessDate(endDate);
  if (!start || !end) throw invalid('invalid_date', { startDate, endDate });
  if (inclusiveDayCount(start, end) > MAX_WINDOW_DAYS) {
    throw invalid('window_too_long', { startDate, endDate, maxDays: MAX_WINDOW_DAYS });
  }
  return { startDate, endDate };
}

/**
 * 청크 → 보관 캡처. 청크는 `tracking_rows`만, 줄은 모두 형식을 지켜야 한다. 확장이 보낸 조회 창(`window`)은 계획
 * 기간 안이어야 하고, 없으면 계획 기간이 곧 조회 기간이다.
 */
export function sellpiaTrackingCapture(
  chunks: readonly OperationStagedChunk[],
  window: OperationWindow | null,
  plan: SellpiaTrackingPlan,
): SellpiaTrackingCapture {
  const range = window ?? { start: plan.startDate, end: plan.endDate };
  if (range.start < plan.startDate || range.end > plan.endDate || range.start > range.end) {
    throw invalid('window_outside_plan', { window: range, plan });
  }
  const rows: SellpiaTrackingRow[] = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== SELLPIA_SHIPMENT_TRACKING_CHUNK_KIND) {
      throw invalid('unexpected_chunk_kind', { chunkKind: chunk.chunkKind });
    }
    const parsed = SellpiaTrackingRowSchema.array().safeParse(chunk.payload);
    if (!parsed.success) {
      throw invalid('invalid_tracking_rows', {
        sequence: chunk.sequence,
        errors: parsed.error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
      });
    }
    rows.push(...parsed.data);
  }
  return { rows, total: rows.length, range: { start: range.start, end: range.end }, confirmedRange: null };
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
