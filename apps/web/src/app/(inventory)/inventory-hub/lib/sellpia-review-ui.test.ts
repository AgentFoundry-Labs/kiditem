import { describe, expect, it } from 'vitest';
import type { SellpiaStockSnapshotItem } from '@kiditem/shared/inventory';
import {
  canBulkApproveSellpiaRow,
  filterSellpiaRows,
  getSellpiaBulkApprovalBlockReason,
  getSellpiaRowBadges,
  requiresSellpiaRowReason,
} from './sellpia-review-ui';

const baseRow: SellpiaStockSnapshotItem = {
  id: '00000000-0000-4000-8000-000000000001',
  rowNumber: 2,
  sellpiaProductCode: 'SP-001',
  sellpiaProductName: '테스트 상품',
  sellpiaStock: 10,
  safetyStock: 0,
  barcode: null,
  productOptionId: '00000000-0000-4000-8000-000000000002',
  inventoryId: '00000000-0000-4000-8000-000000000003',
  rocketLedgerNet: 0,
  targetCurrentStock: 10,
  kiditemStockBefore: 8,
  diff: 2,
  diffRate: 0.2,
  status: 'needs_review',
  blockingReasons: [],
  warningReasons: [],
  operatorTargetStock: null,
  reviewNote: null,
};

function row(patch: Partial<SellpiaStockSnapshotItem>): SellpiaStockSnapshotItem {
  return { ...baseRow, ...patch };
}

describe('sellpia review UI model', () => {
  it('filters matched no-action rows out of the operational buckets', () => {
    const rows = [
      row({ id: '00000000-0000-4000-8000-000000000012', status: 'needs_review' }),
      row({ id: '00000000-0000-4000-8000-000000000013', status: 'new_product_candidate' }),
      row({ id: '00000000-0000-4000-8000-000000000014', status: 'approved_adjusted' }),
      row({
        id: '00000000-0000-4000-8000-000000000015',
        status: 'matched',
        diff: 0,
        targetCurrentStock: 10,
        kiditemStockBefore: 10,
      }),
    ];

    expect(filterSellpiaRows(rows, 'all')).toHaveLength(3);
    expect(filterSellpiaRows(rows, 'review')).toHaveLength(1);
    expect(filterSellpiaRows(rows, 'candidate')).toHaveLength(1);
    expect(filterSellpiaRows(rows, 'done')).toHaveLength(1);
  });

  it('adds warning and blocking badges', () => {
    const badges = getSellpiaRowBadges(row({
      warningReasons: ['large_difference', 'missing_product_name'],
      blockingReasons: ['recent_kiditem_event'],
    }));

    expect(badges).toEqual([
      { tone: 'warning', label: '큰 차이' },
      { tone: 'warning', label: '상품명 없음' },
      { tone: 'danger', label: '최근 KidItem 변동' },
    ]);
  });

  it('requires a reason for large differences, recent KidItem changes, or edited targets', () => {
    expect(requiresSellpiaRowReason(row({ warningReasons: ['large_difference'] }), 10)).toBe(true);
    expect(requiresSellpiaRowReason(row({ blockingReasons: ['recent_kiditem_event'] }), 10)).toBe(true);
    expect(requiresSellpiaRowReason(baseRow, 11)).toBe(true);
    expect(requiresSellpiaRowReason(baseRow, 10)).toBe(false);
  });

  it('explains why a row cannot be bulk approved', () => {
    expect(getSellpiaBulkApprovalBlockReason(baseRow, 10, '')).toBe(null);
    expect(canBulkApproveSellpiaRow(baseRow, 10, '')).toBe(true);
    expect(getSellpiaBulkApprovalBlockReason(row({ inventoryId: null }), 10, '')).toBe('재고 row 없음');
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['duplicate_code'] }), 10, '실사')).toBe('중복 코드');
    expect(canBulkApproveSellpiaRow(row({ blockingReasons: ['duplicate_code'] }), 10, '실사')).toBe(false);
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['invalid_stock'] }), 10, '실사')).toBe('재고값 오류');
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['negative_target_stock'] }), 10, '실사')).toBe('음수 목표');
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['parse_warning'] }), 10, '실사')).toBe('파싱 확인');
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['new_product_candidate'] }), 10, '실사')).toBe('신규 후보');
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['missing_inventory'] }), 10, '실사')).toBe('재고 없음');
    expect(getSellpiaBulkApprovalBlockReason(row({ warningReasons: ['large_difference'] }), 10, '')).toBe('사유 필요');
    expect(getSellpiaBulkApprovalBlockReason(row({ blockingReasons: ['recent_kiditem_event'] }), 10, '')).toBe('사유 필요');
  });
});
