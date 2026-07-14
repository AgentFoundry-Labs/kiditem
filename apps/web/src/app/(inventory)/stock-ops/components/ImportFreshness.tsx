'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { listSellpiaImportRuns, sellpiaImportRunKeyParams } from '../../_shared/inventory-api';
import { ErrorState, LoadingState, ProjectionCard, SimpleTable } from './ZeroItems';

export default function ImportFreshness() {
  const params = { page: 1, limit: 20 };
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.inventory.importRunList(sellpiaImportRunKeyParams(params)), queryFn: () => listSellpiaImportRuns(params) });
  return <ProjectionCard title="가져오기 상태" description="최근 Sellpia 파일 처리 시각과 실패 여부를 확인합니다." icon={Clock3}>
    {error ? <ErrorState /> : isLoading ? <LoadingState /> : <SimpleTable headings={['파일명', '상태', '처리 행', '완료 시각']} rows={(data?.items ?? []).map((run) => [run.fileName, run.status === 'completed' ? '완료' : run.status === 'failed' ? '실패' : '진행 중', formatNumber(run.rowCount), run.importedAt ? formatDateTime(run.importedAt) : '-'])} empty="가져오기 이력이 없습니다." />}
  </ProjectionCard>;
}
