import { describe, expect, it } from 'vitest';
import { KiditemInvalidValueError } from '@kiditem/shared/errors';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import type { WingItemwinnerRow } from '@kiditem/shared/advertising-operations';
import { completeWingItemwinner, wingItemwinnerKpis } from '../wing-itemwinner-operation';

function row(vendorItemId: string, values: Partial<WingItemwinnerRow> = {}): WingItemwinnerRow {
  return { vendorItemId, productName: `상품 ${vendorItemId}`, isWinner: true, myPrice: 1000, winnerPrice: 900, salesQty: 1, suppressed: false, providerWinnerStatus: true, ...values };
}
function rows(sequence: number, payload: unknown[]): OperationStagedChunk {
  return { chunkKind: 'itemwinner_rows', sequence, itemCount: payload.length, payload };
}
function page(totalSize: number, observedAt = '2026-09-26T01:00:00.000Z', vendorId = 'A0001'): OperationStagedChunk {
  return { chunkKind: 'itemwinner_page', sequence: 1, itemCount: 1, payload: [{ totalSize, observedAt, vendorId }] };
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

describe('Wing itemwinner completeness (advertising.wing_itemwinner finalize)', () => {
  it('returns the rows and the observation when the page marker counts exactly the uploaded rows', () => {
    const result = completeWingItemwinner([rows(1, [row('101'), row('102')]), page(2)], '2026-09-26', 'A0001');
    expect(result.rows.map((item) => item.vendorItemId)).toEqual(['101', '102']);
    expect(result.observedAt).toBe('2026-09-26T01:00:00.000Z');
  });

  it('accepts a confirmed empty list (Wing said zero items) as a publication of zero rows', () => {
    expect(completeWingItemwinner([page(0)], '2026-09-26', 'A0001').rows).toEqual([]);
  });

  it('refuses a missing or duplicated page marker, a row count that differs from it, and a duplicated option', () => {
    expect(reason(() => completeWingItemwinner([rows(1, [row('101')])], '2026-09-26', 'A0001'))).toBe('itemwinner_incomplete');
    expect(reason(() => completeWingItemwinner([rows(1, [row('101')]), page(2)], '2026-09-26', 'A0001'))).toBe('itemwinner_incomplete');
    expect(reason(() => completeWingItemwinner([rows(1, [row('101'), row('101')]), page(2)], '2026-09-26', 'A0001'))).toBe('itemwinner_duplicate_row');
    expect(reason(() => completeWingItemwinner([rows(1, [row('101')]), page(1), { ...page(1), sequence: 2 }], '2026-09-26', 'A0001'))).toBe('itemwinner_incomplete');
  });

  it('refuses an unknown chunk kind and an invalid row', () => {
    expect(reason(() => completeWingItemwinner([{ chunkKind: 'traffic_rows', sequence: 1, itemCount: 1, payload: [{}] }, page(0)], '2026-09-26', 'A0001'))).toBe('unknown_chunk_kind');
    expect(reason(() => completeWingItemwinner([rows(1, [{ ...row('101'), myPrice: 'x' }]), page(1)], '2026-09-26', 'A0001'))).toBe('invalid_chunk_item');
  });

  it('refuses a capture the extension read under another Wing vendor than the planned account (old VENDOR_IDENTITY_MISMATCH)', () => {
    expect(reason(() => completeWingItemwinner([page(0, '2026-09-26T01:00:00.000Z', 'B0002')], '2026-09-26', 'A0001'))).toBe('vendor_identity_mismatch');
  });

  it('refuses an observation from another KST business date than the planned one (old BUSINESS_DATE_CHANGED)', () => {
    // 2026-09-26T15:30Z is 2026-09-27 00:30 KST.
    expect(reason(() => completeWingItemwinner([page(0, '2026-09-26T15:30:00.000Z')], '2026-09-26', 'A0001'))).toBe('business_date_changed');
  });

  it('counts winners, suppressed and non-winners from the provider state, suppressed first', () => {
    expect(wingItemwinnerKpis([
      row('1'),
      row('2', { suppressed: true, isWinner: false, providerWinnerStatus: true }),
      row('3', { isWinner: false, providerWinnerStatus: false }),
      row('4', { isWinner: false, providerWinnerStatus: false }),
    ])).toEqual({ winners: 1, suppressed: 1, losers: 2 });
  });
});
