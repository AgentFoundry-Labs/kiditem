import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : resolve(process.cwd(), 'apps/web');

function source(relativePath: string): string {
  return readFileSync(
    resolve(webRoot, 'src/app/(catalog)/product-hub', relativePath),
    'utf8',
  );
}

describe('product hub inventory ownership boundary', () => {
  it('keeps inventory, reorder, and purchase-order decisions out of catalog production files', () => {
    const productionSource = [
      source('components/ProductRowCard.tsx'),
      source('components/ProductCommandCenter.tsx'),
      source('components/AddProductModal.tsx'),
      source('components/ExcelUploadModal.tsx'),
      source('components/ProductsPageContent.tsx'),
      source('components/ProductsColumnHeader.tsx'),
      source('components/category-selection/ProductCategorySelector.tsx'),
      source('[id]/page.tsx'),
      source('[id]/components/ProductInfoCards.tsx'),
      source('[id]/hooks/useProductActions.ts'),
      source('components/ChannelSkuInventorySummary.tsx'),
      source('hooks/useProductHubPageState.ts'),
      source('lib/abc-grading.ts'),
      source('lib/product-page-config.ts'),
      source('lib/product-page-model.ts'),
      source('lib/products-export.ts'),
    ].join('\n');

    for (const forbidden of [
      'currentStock',
      'availableStock',
      'safetyStock',
      'reorderPoint',
      'recommendedOrderQty',
      'stockStatus',
      'stockFilter',
      '/api/purchase-orders',
      '/purchase-orders/new',
      'inventory.create_purchase_order',
      'queryKeys.inventory',
      '현재고',
      '옵션·가격·재고',
    ]) {
      expect(productionSource, `forbidden catalog inventory token: ${forbidden}`).not.toContain(forbidden);
    }

    expect(productionSource).toContain('채널 SKU 전체 현황');
    expect(productionSource).toContain('판매 가능');
    expect(productionSource).toContain('/product-hub/matching');
    expect(productionSource).toContain('카탈로그 상품에 자동 귀속하지 않습니다');
  });
});
