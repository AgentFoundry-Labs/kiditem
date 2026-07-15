'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, History } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import {
  listSellpiaImportRuns,
  sellpiaImportRunKeyParams,
} from '../../_shared/inventory-api';

const PAGE_SIZE = 20;

const statusMeta = {
  completed: { label: '완료', icon: CheckCircle2, style: 'bg-emerald-100 text-emerald-700' },
  failed: { label: '실패', icon: AlertCircle, style: 'bg-red-100 text-red-700' },
  running: { label: '진행 중', icon: Clock3, style: 'bg-blue-100 text-blue-700' },
  pending: { label: '대기', icon: Clock3, style: 'bg-slate-100 text-slate-700' },
} as const;

export default function SellpiaImportHistory() {
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.inventory.historyList(sellpiaImportRunKeyParams(params)),
    queryFn: () => listSellpiaImportRuns(params),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
          <History className="h-5 w-5" aria-hidden="true" /> Sellpia 가져오기 이력
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          파일 처리 결과만 표시합니다. 스냅샷 변화의 원인을 입출고로 추정하지 않습니다.
        </p>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">가져오기 이력을 불러오지 못했습니다.</p> : null}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th>파일명</th>
                <th>상태</th>
                <th className="text-right">처리 행</th>
                <th>완료 시각</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="py-12 text-center text-[var(--text-secondary)]">불러오는 중...</td></tr>
              ) : data?.items.length ? data.items.map((run) => {
                const meta = statusMeta[run.status] ?? statusMeta.pending;
                const Icon = meta.icon;
                return (
                  <tr key={run.id}>
                    <td className="font-medium">{run.fileName ?? '다운로드 전 실패'}</td>
                    <td>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', meta.style)}>
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {meta.label}
                      </span>
                    </td>
                    <td className="text-right">{formatNumber(run.rowCount)}</td>
                    <td className="text-sm text-[var(--text-secondary)]">
                      {run.importedAt ? formatDateTime(run.importedAt) : '-'}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={4} className="py-12 text-center text-[var(--text-secondary)]">가져오기 이력이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={data?.page ?? page}
          limit={data?.limit ?? PAGE_SIZE}
          total={data?.total ?? 0}
          onPageChange={setPage}
        />
      </div>
    </section>
  );
}
