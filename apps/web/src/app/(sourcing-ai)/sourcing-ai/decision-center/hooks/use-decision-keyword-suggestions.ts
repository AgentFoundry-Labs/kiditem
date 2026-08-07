'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchNaverKeywordTrends,
  fetchPopularKeywordBoards,
} from '../../market/lib/trend-collection-api';
import {
  buildTrendKeywords,
  type TrendKeyword,
} from '../../rising-products/lib/rising-keywords';

/** 급상승 탐지 패널과 같은 창(7일)을 본다. 두 화면이 다른 키워드를 추천하면 혼란스럽다. */
const TREND_WINDOW_DAYS = 7;
const SUGGESTION_LIMIT = 8;

/**
 * 새 분석 키워드 입력을 돕는 추천 목록.
 *
 * 이 화면은 키워드를 받아 저장 증거를 재생할 뿐 키워드를 발굴하지 않는다. 발굴은
 * 키워드 분석·급상승 탐지가 이미 하고 있으므로, 그 결과를 그대로 읽어 입력 보조로만
 * 쓴다. 여기서 트렌드를 새로 수집하지 않는다.
 *
 * 쿼리 키는 공용 `queryKeys.sourcing.*` 를 쓰므로 같은 데이터를 보는 다른 화면과
 * 캐시를 공유한다 — 이 칩 때문에 추가 요청이 생기지 않는다.
 */
export function useDecisionKeywordSuggestions(): {
  keywords: TrendKeyword[];
  isLoading: boolean;
} {
  const naverQuery = useQuery({
    queryKey: queryKeys.sourcing.trendNaverKeywords(TREND_WINDOW_DAYS),
    queryFn: () => fetchNaverKeywordTrends(TREND_WINDOW_DAYS),
    staleTime: 5 * 60_000,
  });
  const boardsQuery = useQuery({
    queryKey: queryKeys.sourcing.trendPopularKeywords(TREND_WINDOW_DAYS),
    queryFn: () => fetchPopularKeywordBoards(TREND_WINDOW_DAYS),
    staleTime: 5 * 60_000,
  });

  return {
    // 추천은 보조 기능이다. 한쪽이 실패해도 나머지로 만들 수 있으면 만든다.
    keywords: buildTrendKeywords({
      naverKeywords: naverQuery.data?.keywords ?? [],
      boards: boardsQuery.data?.boards ?? [],
      tracked: [],
      limit: SUGGESTION_LIMIT,
    }),
    isLoading: naverQuery.isLoading || boardsQuery.isLoading,
  };
}
