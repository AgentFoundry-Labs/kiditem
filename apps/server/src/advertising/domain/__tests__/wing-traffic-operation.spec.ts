import { describe, expect, it } from 'vitest';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import { completeWingTraffic, wingTrafficPlanRange } from '../wing-traffic-operation';

const DATES = ['2026-09-01', '2026-09-02', '2026-09-03'];
const SUMMARY = { visitors: 10, views: 20, cartAdds: 3, orders: 2, salesQty: 2, revenue: 5000, providerConversionRate: 10 };

function row(businessDate: string, vendorItemId: string) {
  return { businessDate, vendorItemId, productId: '77', visitors: 1, views: 2, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 };
}
function day(businessDate: string, rows: number, explicitEmpty = rows === 0) {
  return { businessDate, pages: 1, rows, explicitEmpty, capturedAt: `${businessDate}T20:00:00.000Z`, accountSummary: SUMMARY };
}
function period(startDate: string, endDate: string) {
  return { startDate, endDate, capturedAt: '2026-09-04T01:00:00.000Z', accountSummary: SUMMARY };
}
function chunk(chunkKind: string, payload: unknown[], sequence = 1): OperationStagedChunk {
  return { chunkKind, sequence, itemCount: payload.length, payload };
}
function reason(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(KiditemInvalidValueError);
    return (error as KiditemInvalidValueError).details?.reason;
  }
  throw new Error('expected a refusal');
}

describe('wingTrafficPlanRange — the old default range and limits', () => {
  it('defaults to the seven closed days ending at the closed day', () => {
    expect(wingTrafficPlanRange({}, '2026-09-25')).toEqual({
      startDate: '2026-09-19',
      endDate: '2026-09-25',
      expectedDates: ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'],
    });
  });

  it('admits 92 days, refuses 93, a day after the closed day and an unknown calendar date', () => {
    expect(wingTrafficPlanRange({ startDate: '2026-06-01', endDate: '2026-08-31' }, '2026-09-25').expectedDates).toHaveLength(92);
    expect(reason(() => wingTrafficPlanRange({ startDate: '2026-05-31', endDate: '2026-08-31' }, '2026-09-25'))).toBe('traffic_range_too_long');
    expect(reason(() => wingTrafficPlanRange({ startDate: '2026-09-20', endDate: '2026-09-26' }, '2026-09-25'))).toBe('traffic_range_in_future');
    expect(reason(() => wingTrafficPlanRange({ startDate: '2026-02-29', endDate: '2026-03-01' }, '2026-09-25'))).toBe('traffic_range_invalid');
  });
});

describe('completeWingTraffic — the confirmed window and every day of it', () => {
  it('confirms the period window, keeps the unpublished last day out and names Wing-empty days', () => {
    const result = completeWingTraffic([
      chunk('traffic_rows', [row('2026-09-01', '1'), row('2026-09-01', '2')]),
      chunk('traffic_days', [day('2026-09-01', 2), day('2026-09-02', 0)]),
      chunk('traffic_period', [period('2026-09-01', '2026-09-02')]),
    ], DATES);
    expect(result.confirmedDates).toEqual(['2026-09-01', '2026-09-02']);
    expect(result.providerBackedEmptyDates).toEqual(['2026-09-02']);
    expect(result.rows).toHaveLength(2);
  });

  it('refuses a missing period, a day without its marker, a marker that miscounts, and a zero day Wing did not call empty', () => {
    expect(reason(() => completeWingTraffic([chunk('traffic_days', [day('2026-09-01', 0)])], DATES))).toBe('traffic_incomplete');
    expect(reason(() => completeWingTraffic([
      chunk('traffic_days', [day('2026-09-01', 0)]),
      chunk('traffic_period', [period('2026-09-01', '2026-09-02')]),
    ], DATES))).toBe('traffic_incomplete');
    expect(reason(() => completeWingTraffic([
      chunk('traffic_rows', [row('2026-09-01', '1')]),
      chunk('traffic_days', [day('2026-09-01', 2)]),
      chunk('traffic_period', [period('2026-09-01', '2026-09-01')]),
    ], DATES))).toBe('traffic_incomplete');
    expect(reason(() => completeWingTraffic([
      chunk('traffic_days', [day('2026-09-01', 0, false)]),
      chunk('traffic_period', [period('2026-09-01', '2026-09-01')]),
    ], DATES))).toBe('traffic_empty_proof_required');
  });

  it('refuses a date the owner never planned, rows outside the confirmed window and an option twice in a day', () => {
    expect(reason(() => completeWingTraffic([
      chunk('traffic_days', [day('2026-08-31', 0)]),
      chunk('traffic_period', [period('2026-08-31', '2026-09-01')]),
    ], DATES))).toBe('traffic_scope_conflict');
    expect(reason(() => completeWingTraffic([
      chunk('traffic_rows', [row('2026-09-03', '1')]),
      chunk('traffic_days', [day('2026-09-01', 0)]),
      chunk('traffic_period', [period('2026-09-01', '2026-09-01')]),
    ], DATES))).toBe('traffic_scope_conflict');
    expect(reason(() => completeWingTraffic([
      chunk('traffic_rows', [row('2026-09-01', '1'), row('2026-09-01', '1')]),
      chunk('traffic_days', [day('2026-09-01', 2)]),
      chunk('traffic_period', [period('2026-09-01', '2026-09-01')]),
    ], DATES))).toBe('traffic_duplicate_row');
  });
});
