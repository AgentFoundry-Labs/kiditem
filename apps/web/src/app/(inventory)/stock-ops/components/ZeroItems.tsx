'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageX } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { queryKeys } from '@/lib/query-keys';
import { listSellpiaInventorySkus, sellpiaInventoryKeyParams } from '../../_shared/inventory-api';

export default function ZeroItems() {
  const [page, setPage] = useState(1);
  const params = { page, limit: 100, stockStatus: 'out_of_stock' as const };
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.inventory.snapshot(sellpiaInventoryKeyParams(params)),
    queryFn: () => listSellpiaInventorySkus(params),
    placeholderData: keepPreviousData,
  });

  return (
    <ProjectionCard title="Sellpia 현재고 0" description="마지막 완료 파일에서 현재고가 0인 물리 SKU입니다." icon={PackageX}>
      {error ? <ErrorState /> : isLoading ? <LoadingState /> : (
        <SimpleTable headings={['Sellpia 코드', '상품명', '옵션', '바코드']} rows={(data?.items ?? []).map((item) => [item.code, item.name, item.optionName ?? '-', item.barcode ?? '-'])} empty="현재고 0인 SKU가 없습니다." pagination={{ page: data?.page ?? page, limit: data?.limit ?? 100, total: data?.total ?? 0, onPageChange: setPage }} />
      )}
    </ProjectionCard>
  );
}

export function ProjectionCard({ title, description, icon: Icon, children }: { title: string; description: string; icon: typeof PackageX; children: React.ReactNode }) {
  return <section className="space-y-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-5 w-5" aria-hidden="true" /> {title}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p></div>{children}</section>;
}

export function SimpleTable({ headings, rows, empty, pagination }: { headings: string[]; rows: string[][]; empty: string; pagination?: { page: number; limit: number; total: number; onPageChange: (page: number) => void } }) {
  return <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`} className={cellIndex === 0 ? 'font-mono text-xs' : ''}>{cell}</td>)}</tr>) : <tr><td colSpan={headings.length} className="py-12 text-center text-[var(--text-secondary)]">{empty}</td></tr>}</tbody></table></div>{pagination ? <Pagination {...pagination} /> : null}</div>;
}

export function LoadingState() { return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-[var(--text-secondary)]">불러오는 중...</div>; }
export function ErrorState() { return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">데이터를 불러오지 못했습니다.</div>; }
