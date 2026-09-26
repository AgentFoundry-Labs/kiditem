import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import { businessDateKey, parseBusinessDate, shiftBusinessDateKey } from '@kiditem/shared/common';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import {
  WING_TRAFFIC_DAY_CHUNK_KIND,
  WING_TRAFFIC_MAX_COLLECTION_DAYS,
  WING_TRAFFIC_PERIOD_CHUNK_KIND,
  WING_TRAFFIC_ROWS_CHUNK_KIND,
  WingTrafficDaySchema,
  WingTrafficPeriodSchema,
  WingTrafficRowSchema,
  type WingTrafficDay,
  type WingTrafficPeriod,
  type WingTrafficRow,
} from '@kiditem/shared/advertising-operations';
import type { z } from 'zod';

/**
 * 트래픽 수집 범위(KID-362, 옛 `planFor` 규칙 그대로). 비우면 마감된 날(`closedEnd`, 어제 KST)까지 7일.
 * 하루 이상 92일 이하, 마감되지 않은 날은 담지 않는다. 날짜는 KST 달력 키다.
 */
export function wingTrafficPlanRange(
  input: { startDate?: string; endDate?: string },
  closedEnd: string,
): { startDate: string; endDate: string; expectedDates: string[] } {
  const endDate = input.endDate ?? closedEnd;
  const startDate = input.startDate ?? shiftBusinessDateKey(closedEnd, -6);
  const start = parseBusinessDate(startDate);
  const end = parseBusinessDate(endDate);
  if (!start || !end || businessDateKey(start) !== startDate || businessDateKey(end) !== endDate || startDate > endDate) {
    throw invalid('traffic_range_invalid', { startDate, endDate });
  }
  if (endDate > closedEnd) throw invalid('traffic_range_in_future', { endDate, closedEnd });
  const expectedDates: string[] = [];
  for (let date = startDate; date <= endDate; date = shiftBusinessDateKey(date, 1)) {
    expectedDates.push(date);
    if (expectedDates.length > WING_TRAFFIC_MAX_COLLECTION_DAYS) {
      throw invalid('traffic_range_too_long', { startDate, endDate, maxDays: WING_TRAFFIC_MAX_COLLECTION_DAYS });
    }
  }
  return { startDate, endDate, expectedDates };
}

export interface CompleteWingTraffic {
  /** 이 실행이 확정한 날짜(plan 순서). */
  confirmedDates: string[];
  providerBackedEmptyDates: string[];
  days: WingTrafficDay[];
  period: WingTrafficPeriod;
  rows: WingTrafficRow[];
}

/**
 * 트래픽 완결 판정(옛 `validateReceipt`·`validateCoverage`). 쿠팡은 마지막 날을 늦게 공개하므로 확정 창은 plan보다
 * 짧을 수 있다 — 기간 표식이 그 창을 말하고, 그 창의 날마다 날 표식이 정확히 하나여야 한다. 날 표식의 행 수는 그날
 * 올린 행 수와 같아야 하고, 0행인 날은 Wing이 0개라고 답한 날(`explicitEmpty`)이어야 한다. 모두 VALIDATION_FAILED.
 */
export function completeWingTraffic(
  chunks: readonly OperationStagedChunk[],
  expectedDates: readonly string[],
  plannedVendorId: string,
): CompleteWingTraffic {
  const known = new Set<string>([WING_TRAFFIC_ROWS_CHUNK_KIND, WING_TRAFFIC_DAY_CHUNK_KIND, WING_TRAFFIC_PERIOD_CHUNK_KIND]);
  const unknown = chunks.find((chunk) => !known.has(chunk.chunkKind));
  if (unknown) throw invalid('unknown_chunk_kind', { chunkKind: unknown.chunkKind });
  const rows = chunkItems(chunks, WING_TRAFFIC_ROWS_CHUNK_KIND, WingTrafficRowSchema);
  const days = chunkItems(chunks, WING_TRAFFIC_DAY_CHUNK_KIND, WingTrafficDaySchema);
  const periods = chunkItems(chunks, WING_TRAFFIC_PERIOD_CHUNK_KIND, WingTrafficPeriodSchema);
  if (periods.length !== 1) throw invalid('traffic_incomplete', { periods: periods.length });
  const [period] = periods as [WingTrafficPeriod];
  // 행마다 확인하는 판매자 식별자는 빈 날엔 없다. 창 표식의 것으로 확인해 다른 Wing 계정의 빈 창이 이 계정 리스팅을
  // 0으로 채우지 못하게 한다.
  if (period.vendorId !== plannedVendorId) {
    throw invalid('vendor_identity_mismatch', { plannedVendorId, observedVendorId: period.vendorId });
  }
  const start = expectedDates.indexOf(period.startDate);
  const end = expectedDates.indexOf(period.endDate);
  // 계획 밖 날짜는 범위 충돌이다: 무엇을 모을지는 owner가 정한다.
  if (start < 0 || end < start) throw invalid('traffic_scope_conflict', { startDate: period.startDate, endDate: period.endDate });
  const confirmedDates = expectedDates.slice(start, end + 1);
  const confirmed = new Set(confirmedDates);
  const dayByDate = new Map<string, WingTrafficDay>();
  for (const day of days) {
    if (!confirmed.has(day.businessDate)) throw invalid('traffic_scope_conflict', { businessDate: day.businessDate });
    if (dayByDate.has(day.businessDate)) throw invalid('traffic_incomplete', { businessDate: day.businessDate });
    dayByDate.set(day.businessDate, day);
  }
  const rowCounts = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!confirmed.has(row.businessDate)) throw invalid('traffic_scope_conflict', { businessDate: row.businessDate });
    const key = `${row.businessDate}:${row.vendorItemId}`;
    if (seen.has(key)) throw invalid('traffic_duplicate_row', { businessDate: row.businessDate, vendorItemId: row.vendorItemId });
    seen.add(key);
    rowCounts.set(row.businessDate, (rowCounts.get(row.businessDate) ?? 0) + 1);
  }
  for (const businessDate of confirmedDates) {
    const day = dayByDate.get(businessDate);
    const count = rowCounts.get(businessDate) ?? 0;
    if (!day || day.rows !== count) throw invalid('traffic_incomplete', { businessDate, rows: count });
    if (count === 0 && !day.explicitEmpty) throw invalid('traffic_empty_proof_required', { businessDate });
    if (count > 0 && day.explicitEmpty) throw invalid('traffic_incomplete', { businessDate, rows: count });
  }
  return {
    confirmedDates,
    providerBackedEmptyDates: confirmedDates.filter((date) => dayByDate.get(date)!.explicitEmpty),
    days: confirmedDates.map((date) => dayByDate.get(date)!),
    period,
    rows,
  };
}

function chunkItems<S extends z.ZodTypeAny>(chunks: readonly OperationStagedChunk[], chunkKind: string, schema: S): Array<z.output<S>> {
  const items: Array<z.output<S>> = [];
  for (const chunk of chunks) {
    if (chunk.chunkKind !== chunkKind) continue;
    for (const raw of chunk.payload) {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        throw invalid('invalid_chunk_item', {
          chunkKind,
          errors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), reason: issue.message })),
        });
      }
      items.push(parsed.data);
    }
  }
  return items;
}

function invalid(reason: string, details: Record<string, unknown>): KiditemInvalidValueError {
  return new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason, ...details } });
}
