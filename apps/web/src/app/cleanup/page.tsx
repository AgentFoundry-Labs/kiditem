"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { ProductListItem as Product } from '@kiditem/shared';

import { Trash2 } from "lucide-react";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { queryKeys } from "@/lib/query-keys";
import CleanupSummary from "./components/CleanupSummary";
import CleanupTable from "./components/CleanupTable";

export default function CleanupPage() {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const queryParams = useMemo(() => ({
    maxProfitRate: '3',
    page: String(page),
    limit: String(PAGE_SIZE),
  }), [page]);

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.products.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.get<{ items: Product[] }>(`/api/products?${params}`);
    },
  });

  const products = useMemo(() => {
    if (!data) return [];
    return (data.items || []).filter((p: Product) => p.status !== 'draft' && p.status !== 'processing');
  }, [data]);

  const total = products.length;
  const error = queryError ? "정리 대상 데이터를 불러오지 못했습니다." : null;

  const minusCount = products.filter((p) => p.profitRate < 0).length;
  const lowCount = products.filter((p) => p.profitRate >= 0).length;

  if (loading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <Trash2 size={24} className="inline mr-2 text-red-500" />
          정리 대상 (순이익 3% 이하)
        </h1>
      </div>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      <CleanupSummary minusCount={minusCount} lowCount={lowCount} total={total} />

      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h3 className="font-semibold text-sm text-slate-700 mb-3">정리 판단 플로우</h3>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="px-3 py-1.5 bg-red-100 text-red-800 rounded-lg font-medium">순이익 3% 이하 감지</span>
          <span>&rarr;</span>
          <span className="px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg font-medium">원인 분석 (광고? 가격? 수수료?)</span>
          <span>&rarr;</span>
          <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg font-medium">판단 (개선 / 정리)</span>
          <span>&rarr;</span>
          <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg font-medium">처리</span>
        </div>
      </div>

      <CleanupTable
        products={products}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
      />
    </div>
  );
}
