import type {
  SellpiaBlockingReason,
  SellpiaStockSnapshotItem,
  SellpiaWarningReason,
} from '@kiditem/shared/inventory';

export type SellpiaReviewFilter = 'all' | 'recommended' | 'review' | 'candidate' | 'rejected' | 'done';
export type SellpiaBadgeTone = 'neutral' | 'warning' | 'danger' | 'success';
export type SellpiaRowBadge = { tone: SellpiaBadgeTone; label: string };

const appliedStatuses = new Set<SellpiaStockSnapshotItem['status']>([
  'approved_adjusted',
  'manual_adjusted',
  'ignored',
]);

const warningLabels: Record<SellpiaWarningReason, SellpiaRowBadge> = {
  large_difference: { tone: 'warning', label: '큰 차이' },
};

const blockingLabels: Record<SellpiaBlockingReason, SellpiaRowBadge> = {
  duplicate_code: { tone: 'danger', label: '중복 코드' },
  invalid_stock: { tone: 'danger', label: '재고값 오류' },
  negative_target_stock: { tone: 'danger', label: '음수 목표' },
  parse_warning: { tone: 'danger', label: '파싱 확인' },
  recent_kiditem_event: { tone: 'danger', label: '최근 KidItem 변동' },
  new_product_candidate: { tone: 'warning', label: '신규 후보' },
  missing_inventory: { tone: 'danger', label: '재고 없음' },
};

const hardBlockingReasons = new Set<SellpiaBlockingReason>([
  'duplicate_code',
  'invalid_stock',
  'negative_target_stock',
  'parse_warning',
  'new_product_candidate',
  'missing_inventory',
]);

export function filterSellpiaRows(
  rows: SellpiaStockSnapshotItem[],
  filter: SellpiaReviewFilter,
): SellpiaStockSnapshotItem[] {
  if (filter === 'all') return rows;
  if (filter === 'recommended') return rows.filter((row) => row.status === 'recommended');
  if (filter === 'review') {
    return rows.filter((row) => row.status === 'needs_review' || row.status === 'missing_inventory');
  }
  if (filter === 'candidate') return rows.filter((row) => row.status === 'new_product_candidate');
  if (filter === 'rejected') return rows.filter((row) => row.status === 'rejected');
  return rows.filter((row) => appliedStatuses.has(row.status));
}

export function getSellpiaFilterCount(rows: SellpiaStockSnapshotItem[], filter: SellpiaReviewFilter): number {
  return filterSellpiaRows(rows, filter).length;
}

export function getSellpiaRowBadges(row: SellpiaStockSnapshotItem): SellpiaRowBadge[] {
  return [
    ...row.warningReasons.map((reason) => warningLabels[reason]),
    ...row.blockingReasons.map((reason) => blockingLabels[reason]),
  ].filter((badge): badge is SellpiaRowBadge => Boolean(badge));
}

export function requiresSellpiaRowReason(row: SellpiaStockSnapshotItem, operatorTargetStock: number): boolean {
  return (
    row.warningReasons.includes('large_difference') ||
    row.blockingReasons.includes('recent_kiditem_event') ||
    operatorTargetStock !== row.targetCurrentStock
  );
}

export function getSellpiaBulkApprovalBlockReason(
  row: SellpiaStockSnapshotItem,
  operatorTargetStock: number,
  reason: string,
): string | null {
  if (!row.inventoryId) return '재고 row 없음';
  if (row.status !== 'recommended' && row.status !== 'needs_review') return '승인 대상 아님';
  const hardBlock = row.blockingReasons.find((blockingReason) => hardBlockingReasons.has(blockingReason));
  if (hardBlock) return blockingLabels[hardBlock].label;
  if (requiresSellpiaRowReason(row, operatorTargetStock) && !reason.trim()) return '사유 필요';
  return null;
}

export function canBulkApproveSellpiaRow(
  row: SellpiaStockSnapshotItem,
  operatorTargetStock: number,
  reason: string,
): boolean {
  return getSellpiaBulkApprovalBlockReason(row, operatorTargetStock, reason) === null;
}
