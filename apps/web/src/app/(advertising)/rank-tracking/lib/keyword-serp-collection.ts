'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KEYWORD_SERP_KIND, KEYWORD_SERP_MAX_KEYWORDS } from '@kiditem/shared/advertising-operations';
import type { OperationListResponse } from '@kiditem/shared/operation';
import { useCollectionSourceControl, type CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { advertisingOperationCollection } from '@/lib/advertising-operation-collection';
import { queryKeys } from '@/lib/query-keys';
import { fetchProductKeywordRanks } from './rank-api';
import { wingRankProgressLabel } from './wing-rank-collection';

export const SERP_KEYWORDS_MISSING = '순위를 확인할 대표 키워드가 없습니다. 상품의 대표 키워드를 먼저 정해 주세요.';
/** 순위 추적 화면의 기본 기간(대표 키워드 목록을 같은 읽기로 얻는다). */
const OVERVIEW_DAYS = 30;

/**
 * 쿠팡 검색 SERP 순위(실행 kind `advertising.keyword_serp`, KID-362)를 공용 컨트롤에 건다. 시작은 순위 추적 화면의
 * 대표 키워드 목록(Wing 판매순위와 같은 키워드)을 scope로 보낸다. 같은 키워드의 Wing 판매순위가 돌고 있으면 서버가
 * `OPERATION_IN_PROGRESS`로 거절한다(키워드 슬롯 공유).
 */
export function keywordSerpCollection(): CollectionSourceAdapter<OperationListResponse, readonly string[]> {
  return advertisingOperationCollection<readonly string[]>({
    kind: KEYWORD_SERP_KIND,
    sourceKey: KEYWORD_SERP_KIND,
    label: '쿠팡 검색 순위 수집',
    queryKey: queryKeys.ads.keywordSerpOperations(),
    scope: (keywords) => {
      if (keywords.length === 0) throw new Error(SERP_KEYWORDS_MISSING);
      return { keywords: keywords.slice(0, KEYWORD_SERP_MAX_KEYWORDS) };
    },
    scopeLabel: wingRankProgressLabel,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywordRank() });
    },
  });
}

/** 순위 추적 화면의 대표 키워드(중복 없이, 표시 순서대로). */
export function useRepresentativeKeywords(): readonly string[] {
  const { data } = useQuery({
    queryKey: queryKeys.ads.keywordRankProducts(OVERVIEW_DAYS),
    queryFn: () => fetchProductKeywordRanks(OVERVIEW_DAYS),
  });
  return useMemo(
    () => [...new Set((data?.rows ?? []).map((row) => row.keyword).filter((keyword): keyword is string => Boolean(keyword?.trim())))],
    [data?.rows],
  );
}

export function useKeywordSerpCollection() {
  const adapter = useMemo(() => keywordSerpCollection(), []);
  return useCollectionSourceControl(adapter);
}
