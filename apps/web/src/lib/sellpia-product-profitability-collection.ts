'use client';

import type { OperationListResponse } from '@kiditem/shared/operation';
import { SELLPIA_PRODUCT_PROFITABILITY_KIND } from '@kiditem/shared/sellpia-operations';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaOperationControl } from '@/lib/sellpia-operations';

/**
 * 셀피아 상품 손익 수집 = 실행 kind `analytics.sellpia_product_profitability`(KID-361 J3). 확장에 시작만 보내고(범위는
 * owner plan: 어제까지 401일), 도는 실행·중단은 실행 reader가 말한다. 수집은 ABC를 발행하지 않는다. 새 성공 실행은
 * 상품 운영 센터와 재고 분석이 읽는 손익 근거를 새로 한다.
 */
export const sellpiaProductProfitabilityCollection: CollectionSourceAdapter<OperationListResponse> = sellpiaOperationControl({
  kind: SELLPIA_PRODUCT_PROFITABILITY_KIND,
  sourceKey: 'analytics.sellpia_product_profitability',
  label: '셀피아 상품 손익 수집',
  scope: () => ({}),
  scopeLabel: (operation) => (operation.window ? `${operation.window.start} ~ ${operation.window.end}` : null),
  onNewComplete: (queryClient) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.productSalesAll() });
  },
});
