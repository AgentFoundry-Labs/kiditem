'use client';

import { useQuery } from '@tanstack/react-query';
import type { RebuildReadinessResponse } from '@kiditem/shared/readiness';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function RebuildReadinessBanner() {
  const { data } = useQuery({
    queryKey: ['readiness', 'rebuild'],
    queryFn: () => apiClient.get<RebuildReadinessResponse>('/api/readiness/rebuild'),
    staleTime: 10_000,
    refetchInterval: 15_000,
    meta: { suppressGlobalErrorToast: true },
  });

  if (data?.state !== 'snapshot_required') return null;

  return (
    <section className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-amber-950">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-64 flex-1">
          <p className="font-semibold">재고 기준 데이터 가져오기가 필요합니다</p>
          <p className="mt-0.5 text-amber-800">
            셀피아 재고를 먼저 가져온 뒤 Wing 상품을 가져오세요. 완료 전에는 일반 작업이 잠깁니다.
          </p>
        </div>
        <Link
          href="/inventory-hub?tab=overview"
          className="rounded-md bg-amber-900 px-3 py-2 font-medium text-white hover:bg-amber-800"
        >
          셀피아 재고 가져오기
        </Link>
        <Link
          href="/product-hub/matching"
          className="rounded-md border border-amber-400 bg-white px-3 py-2 font-medium text-amber-950 hover:bg-amber-100"
        >
          Wing 상품 가져오기
        </Link>
      </div>
    </section>
  );
}
