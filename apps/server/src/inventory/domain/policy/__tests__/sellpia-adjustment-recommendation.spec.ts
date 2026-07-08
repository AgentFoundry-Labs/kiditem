import { describe, expect, it } from 'vitest';
import {
  buildSellpiaRecommendation,
  requiresSellpiaApprovalReason,
} from '../sellpia-adjustment-recommendation';

describe('Sellpia adjustment recommendation policy', () => {
  it('marks non-zero differences as review rows using Sellpia stock plus Rocket stock-impact ledger net', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 10,
      rocketLedgerNet: -2,
      kiditemStockBefore: 6,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(result.targetCurrentStock).toBe(8);
    expect(result.diff).toBe(2);
    expect(result.status).toBe('needs_review');
  });

  it('marks exact stock matches as no-action matched rows', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 10,
      rocketLedgerNet: 0,
      kiditemStockBefore: 10,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(result.targetCurrentStock).toBe(10);
    expect(result.diff).toBe(0);
    expect(result.status).toBe('matched');
  });

  it('marks unmatched rows as new product candidates', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 3,
      rocketLedgerNet: 0,
      kiditemStockBefore: 0,
      warnings: [],
      productOptionId: null,
      inventoryId: null,
      hasRecentKidItemEvent: false,
    });

    expect(result.status).toBe('new_product_candidate');
    expect(result.blockingReasons).toContain('new_product_candidate');
  });

  it('warns but does not block large differences', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 100,
      rocketLedgerNet: 0,
      kiditemStockBefore: 1,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(result.status).toBe('needs_review');
    expect(result.warningReasons).toContain('large_difference');
    expect(requiresSellpiaApprovalReason(result, 100)).toBe(true);
  });

  it('maps missing product names to non-blocking row warnings', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 12,
      rocketLedgerNet: 0,
      kiditemStockBefore: 10,
      warnings: ['missing_product_name'],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(result.status).toBe('needs_review');
    expect(result.blockingReasons).toEqual([]);
    expect(result.warningReasons).toContain('missing_product_name');
  });

  it('requires a reason when operator target differs from recommended target', () => {
    const result = buildSellpiaRecommendation({
      sellpiaStock: 10,
      rocketLedgerNet: 0,
      kiditemStockBefore: 9,
      warnings: [],
      productOptionId: 'option-1',
      inventoryId: 'inventory-1',
      hasRecentKidItemEvent: false,
    });

    expect(requiresSellpiaApprovalReason(result, 11)).toBe(true);
    expect(requiresSellpiaApprovalReason(result, 10)).toBe(false);
  });
});
