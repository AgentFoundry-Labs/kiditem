import type {
  SellpiaBlockingReason,
  SellpiaSnapshotItemStatus,
  SellpiaWarningReason,
} from '@kiditem/shared/inventory';

export type SellpiaRecommendationWarning =
  | 'duplicate_code'
  | 'invalid_stock'
  | 'missing_product_code';

export type SellpiaRecommendationInput = {
  sellpiaStock: number;
  rocketLedgerNet: number;
  kiditemStockBefore: number;
  warnings: SellpiaRecommendationWarning[];
  productOptionId: string | null;
  inventoryId: string | null;
  hasRecentKidItemEvent: boolean;
};

export type SellpiaRecommendation = {
  targetCurrentStock: number;
  diff: number;
  diffRate: number;
  status: SellpiaSnapshotItemStatus;
  blockingReasons: SellpiaBlockingReason[];
  warningReasons: SellpiaWarningReason[];
};

export function buildSellpiaRecommendation(
  input: SellpiaRecommendationInput,
): SellpiaRecommendation {
  const targetCurrentStock = input.sellpiaStock + input.rocketLedgerNet;
  const diff = targetCurrentStock - input.kiditemStockBefore;
  const denominator = Math.max(input.kiditemStockBefore, targetCurrentStock, 1);
  const diffRate = Math.abs(diff) / denominator;
  const blockingReasons: SellpiaBlockingReason[] = [];
  const warningReasons: SellpiaWarningReason[] = [];

  if (!input.productOptionId) blockingReasons.push('new_product_candidate');
  if (input.productOptionId && !input.inventoryId) blockingReasons.push('missing_inventory');
  if (targetCurrentStock < 0) blockingReasons.push('negative_target_stock');
  if (input.hasRecentKidItemEvent) blockingReasons.push('recent_kiditem_event');
  if (input.warnings.includes('duplicate_code')) blockingReasons.push('duplicate_code');
  if (input.warnings.includes('invalid_stock')) blockingReasons.push('invalid_stock');
  if (input.warnings.includes('missing_product_code')) blockingReasons.push('parse_warning');
  if (Math.abs(diff) >= 20 || diffRate >= 0.3) warningReasons.push('large_difference');

  const status: SellpiaSnapshotItemStatus = blockingReasons.includes('new_product_candidate')
    ? 'new_product_candidate'
    : blockingReasons.length > 0
      ? 'needs_review'
      : 'recommended';

  return { targetCurrentStock, diff, diffRate, status, blockingReasons, warningReasons };
}

export function requiresSellpiaApprovalReason(
  recommendation: Pick<SellpiaRecommendation, 'targetCurrentStock' | 'warningReasons'>,
  operatorTargetStock: number,
): boolean {
  return (
    recommendation.warningReasons.includes('large_difference') ||
    operatorTargetStock !== recommendation.targetCurrentStock
  );
}
