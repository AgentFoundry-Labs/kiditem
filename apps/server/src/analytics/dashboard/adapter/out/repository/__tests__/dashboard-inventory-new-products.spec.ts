import { describe, expect, it, vi } from 'vitest';
import { PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD } from '@kiditem/shared/product-abc';
import { DashboardInventoryRepositoryAdapter } from '../dashboard-inventory.repository.adapter';

/**
 * 신상품 sits beside A/B/C (owner decision 2026-09-18): an ungraded product
 * younger than the formula's minimum sale age is new, not a C. It is counted
 * with Products' sale-age rule over Products' own read, never graded here.
 */
describe('DashboardInventoryRepositoryAdapter — new products', () => {
  const view = (masterProductId: string, saleStartDate: string | null, graded = false) => ({
    masterProductId,
    contributionEligible: false,
    saleStartDate,
    abc: {
      evaluation: graded ? { abcGrade: 'B', weightedOperatingProfit: 1 } : null,
      sources: { mapping: { valid: true }, sellpia: { ready: true }, advertising: { ready: false }, advertisingRequired: false },
    },
  });

  it('counts ungraded products younger than the minimum sale age, and nothing else', async () => {
    const prisma = {
      masterProduct: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const productAbc = {
      readAbc: vi.fn().mockResolvedValue({
        targetCutoff: '2026-09-17',
        actualCutoff: '2026-09-17',
        capturedAt: null,
        publication: { formula: PRODUCT_ABC_ABSOLUTE_AD_FREE_PAYLOAD, publicationRevision: 1 },
        products: [
          view('young', '2026-09-01'),            // 16 days: new
          view('old', '2026-06-01'),              // old enough, just short of evidence
          view('never-sold', null),               // no sale start: not new
          view('young-but-graded', '2026-09-05', true),
        ],
      }),
    };
    const activeProducts = ['young', 'old', 'never-sold', 'young-but-graded'].map((masterProductId) => ({
      masterProductId,
      code: `KID-${masterProductId}`,
      sourceAccountKey: 'sellpia',
      sourceProductCode: masterProductId,
      sourceOptionCode: '',
      name: `Product ${masterProductId}`,
      optionName: null,
      barcode: null,
      purchasePrice: null,
      imageUrls: [],
    }));
    const productSource = {
      listActiveForMatching: vi.fn().mockResolvedValue(activeProducts),
    };
    const adapter = new DashboardInventoryRepositoryAdapter(
      prisma as never,
      productAbc as never,
      {} as never,
      {} as never,
      productSource as never,
    );

    const facts = await adapter.readProductAbcFacts('11111111-1111-4111-8111-111111111111');

    expect(productSource.listActiveForMatching).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(productAbc.readAbc).toHaveBeenCalledWith({
      organizationId: '11111111-1111-4111-8111-111111111111',
      masterProductIds: activeProducts.map(({ masterProductId }) => masterProductId),
    });
    expect(facts.newProductCount).toBe(1);
  });
});
