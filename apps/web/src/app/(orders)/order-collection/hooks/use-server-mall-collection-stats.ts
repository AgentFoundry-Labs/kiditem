'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mallOperationOutcomesApi } from '@/lib/mall-operation-outcomes-api';
import { queryKeys } from '@/lib/query-keys';
import {
  buildServerMallCollectionStats,
  type ServerMallCollectionStat,
} from '../lib/server-mall-collection-stats';

/** 오늘 하루 여러 몰이 여러 번 돌아도 덮이지 않을 만큼만 읽는다. */
const RECENT_LIMIT = 200;
const RECENT_PARAMS = { operation: 'order_collection' as const, limit: RECENT_LIMIT };

/**
 * 몰 카드의 '당일'을 서버 기억에서 읽는다.
 *
 * 이 브라우저의 파일 목록이 아니라 서버에 남은 몰별 수집 결과를 보므로, 다른 기기 · 다른
 * 화면(대시보드 버튼 · 자동 운전 고리)에서 돌린 수집도 같은 숫자로 보인다. 1분마다 다시 읽어
 * 화면을 열어 둔 동안에도 따라간다.
 */
export function useServerMallCollectionStats(): {
  stats: Map<string, ServerMallCollectionStat>;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.mallOperationOutcomes.recent(RECENT_PARAMS),
    queryFn: () => mallOperationOutcomesApi.recent(RECENT_PARAMS),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const stats = useMemo(
    () => buildServerMallCollectionStats(query.data?.items ?? []),
    [query.data],
  );
  return { stats, loading: query.isLoading };
}
