'use client';

import type { SellpiaImportRunSummary } from '@kiditem/shared/inventory';
import { formatDateTime, formatNumber } from '@/lib/utils';

export function SellpiaSyncHistory({
  items,
  isLoading = false,
}: {
  items: SellpiaImportRunSummary[];
  isLoading?: boolean;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-[var(--text-primary)]">이력</h3>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th>파일</th>
              <th>상태</th>
              <th className="text-right">행</th>
              <th>시각</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="p-4 text-center">불러오는 중...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center">동기화 이력이 없습니다.</td></tr>
            ) : items.map((run) => (
              <tr key={run.id}>
                <td>{run.fileName ?? '다운로드 전 실패'}</td>
                <td>{run.status === 'completed' ? '완료' : run.status === 'running' ? '진행 중' : '실패'}</td>
                <td className="text-right">{formatNumber(run.rowCount)}</td>
                <td>{formatDateTime(run.importedAt ?? run.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
