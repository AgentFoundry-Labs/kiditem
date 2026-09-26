'use client';

import {
  WING_TRACKED_PRODUCTS_KIND,
  WingTrackedProductsResultSchema,
  type WingTrackedProductsResult,
} from '@kiditem/shared/advertising-operations';
import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { advertisingOperationCollection, advertisingOperationState } from '@/lib/advertising-operation-collection';
import { queryKeys } from '@/lib/query-keys';
import { requireWingSearchAccount, type WingAccountRead } from '@/lib/wing-search-account';

/**
 * 추적 상품 지표 수집(실행 kind `advertising.wing_tracked_products`, KID-362)을 공용 컨트롤에 건다. 지표 새로고침은
 * 활성 추적 상품의 키워드와 조직의 대표 쿠팡 계정을 scope로 확장에 시작시킨다(잠금 `account:<id>` — 그 계정의 다른
 * Wing 수집과 서로 막는다). 완료는 추적 상품·이력 읽기를 다시 읽는다.
 */
export function wingTrackedProductsCollection(
  accountRead: WingAccountRead,
): CollectionSourceAdapter<OperationListResponse, readonly string[]> {
  return advertisingOperationCollection<readonly string[]>({
    kind: WING_TRACKED_PRODUCTS_KIND,
    sourceKey: WING_TRACKED_PRODUCTS_KIND,
    label: '추적 상품 지표 수집',
    queryKey: queryKeys.sourcing.wingTrackedSourceStatus(),
    scope: (keywords) => ({ channelAccountId: requireWingSearchAccount(accountRead).id, keywords: [...keywords] }),
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sourcing.wingTrackedProducts(),
        predicate: (query) => !query.queryKey.includes('source-status'),
      });
    },
  });
}

/** 화면이 보는 추적 수집 상태: 마지막 실행과 마지막 성공(그 결과). */
export type WingTrackedCollectionSummary = Readonly<{
  latest: OperationView | null;
  lastSucceeded: (OperationView & { summary: WingTrackedProductsResult | null }) | null;
}>;

export function wingTrackedCollectionSummary(status: OperationListResponse | undefined): WingTrackedCollectionSummary {
  const { latest, lastSucceeded } = advertisingOperationState(status);
  const result = WingTrackedProductsResultSchema.safeParse(lastSucceeded?.result);
  return {
    latest,
    lastSucceeded: lastSucceeded ? { ...lastSucceeded, summary: result.success ? result.data : null } : null,
  };
}
