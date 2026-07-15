'use client';

import { useQuery } from '@tanstack/react-query';
import { ListOrdered, Loader2 } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { fetchKeywordSerp } from '../lib/rank-api';
import SerpItemsTable from './SerpItemsTable';

/** 키워드 최신 SERP 캡처 뷰어 — 자사 상품 하이라이트로 경쟁 구도 확인. */
export default function SerpViewer({ keyword }: { keyword: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ads.keywordRankSerp(keyword),
    queryFn: () => fetchKeywordSerp(keyword),
  });

  const items = data?.items ?? [];
  const ownVendorItemIds = data?.ownVendorItemIds ?? [];
  const ownCount = items.filter(
    (item) => item.vendorItemId && ownVendorItemIds.includes(item.vendorItemId),
  ).length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">&lsquo;{keyword}&rsquo; 최신 검색 결과</h2>
          <p className="mt-0.5 text-xs text-slate-400">캡처된 순서 그대로 — 광고 슬롯 포함</p>
        </div>
        {data?.capturedAt && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="tabular-nums">{formatDateTime(data.capturedAt)}</span>
            <span className="tabular-nums">
              {formatNumber(data.itemCount ?? items.length)}개 · {data.pagesScanned ?? 0}페이지
            </span>
            {ownCount > 0 && (
              <span className="rounded bg-purple-50 px-1.5 py-0.5 font-bold text-purple-700">
                자사 {ownCount}개 노출
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-8 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin text-purple-600" />
          SERP 불러오는 중…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center text-slate-400">
          <ListOrdered size={28} className="mx-auto mb-2 opacity-20" />
          <p className="text-sm font-medium">저장된 검색 결과가 없습니다</p>
          <p className="mt-1 text-xs">순위 체크를 실행하면 최신 검색 결과가 저장됩니다</p>
        </div>
      ) : (
        <div className="max-h-[560px] overflow-y-auto">
          <SerpItemsTable items={items} ownVendorItemIds={ownVendorItemIds} />
        </div>
      )}
    </div>
  );
}
