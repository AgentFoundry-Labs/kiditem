'use client';

import {
  COMPETITOR_CATALOG_KIND,
  COMPETITOR_SELLER_IDENTITY_KIND,
} from '@kiditem/shared/advertising-operations';
import type { OperationListResponse } from '@kiditem/shared/operation';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { advertisingOperationCollection } from '@/lib/advertising-operation-collection';
import { queryKeys } from '@/lib/query-keys';
import type { QueryClient } from '@tanstack/react-query';

/** 판매자 수집 입력: 없으면 추적 판매자 전체(판매자마다 최신 상품 100개), 있으면 그 판매자 하나. */
export type CompetitorCatalogInput = Readonly<{ sellerId?: string }>;

function refreshCompetitors(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: [...queryKeys.sourcing.all, 'competitors'],
    predicate: (query) => !query.queryKey.includes('source-status'),
  });
}

/**
 * 경쟁사 카탈로그(실행 kind `advertising.competitor_catalog`, KID-362)를 공용 컨트롤에 건다. 경쟁사 화면의 "판매자
 * 수집·갱신"(전체)과 판매자별 수집이 확장에 `operation.start`를 보낸다. SERP 순위 → 판매자 확인이 이어서 시작한 보강도
 * 같은 kind라 여기서 진행·중단이 보인다. 완료는 경쟁사 읽기를 다시 읽는다.
 */
export const competitorCatalogCollection: CollectionSourceAdapter<OperationListResponse, CompetitorCatalogInput> =
  advertisingOperationCollection<CompetitorCatalogInput>({
    kind: COMPETITOR_CATALOG_KIND,
    sourceKey: COMPETITOR_CATALOG_KIND,
    label: '경쟁 판매자 수집',
    queryKey: queryKeys.sourcing.competitorCatalogSourceStatus(),
    scope: (input) => (input.sellerId ? { sellerId: input.sellerId } : {}),
    onNewComplete: refreshCompetitors,
  });

/**
 * 경쟁 판매자 확인(실행 kind `advertising.competitor_seller_identity`, KID-362): 최근 SERP에서 판매자를 모르는 경쟁 상품의
 * 상세를 열어 판매자를 확인한다. 끝나면 확장이 카탈로그 보강을 이어서 시작한다.
 */
export const competitorSellerIdentityCollection: CollectionSourceAdapter<OperationListResponse> =
  advertisingOperationCollection<void>({
    kind: COMPETITOR_SELLER_IDENTITY_KIND,
    sourceKey: COMPETITOR_SELLER_IDENTITY_KIND,
    label: '경쟁 판매자 확인',
    queryKey: queryKeys.sourcing.competitorSellerIdentitySourceStatus(),
    scope: () => ({}),
    onNewComplete: refreshCompetitors,
  });
