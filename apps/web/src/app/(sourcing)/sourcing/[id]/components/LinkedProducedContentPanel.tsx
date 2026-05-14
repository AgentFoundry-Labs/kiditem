'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Sparkles } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { apiClient } from '@/lib/api-client';
import { formatTime } from '@/lib/utils';

interface LinkedGeneration {
  id: string;
  contentType: 'detail_page' | 'image' | string;
  title: string;
  href: string | null;
  status: string;
  productId: string | null;
  updatedAt: string;
}

interface LinkedProducedContentResponse {
  items: LinkedGeneration[];
  total: number;
}

export function LinkedProducedContentPanel({
  candidateId,
  promotedMasterId,
}: {
  candidateId: string;
  promotedMasterId: string | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.productContent.sourcingLinks(candidateId, { limit: '8' }),
    queryFn: () =>
      apiClient.get<LinkedProducedContentResponse>(
        `/api/ai/content-archive/sourcing/${candidateId}?limit=8`,
      ),
  });
  const items = data?.items ?? [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-left">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">연결된 생성 콘텐츠</p>
          <p className="mt-0.5 text-xs text-slate-500">이 소스 후보를 출처로 만든 작업물</p>
        </div>
        {promotedMasterId && (
          <Link
            href={`/sourcing?masterId=${encodeURIComponent(promotedMasterId)}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
          >
            상품 연결
            <ExternalLink size={12} />
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-slate-50" />
      ) : items.length === 0 ? (
        <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          아직 이 후보에서 생성된 콘텐츠가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href ?? '/sourcing'}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-800">
                  {item.title}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles size={11} />
                  {item.contentType === 'image' ? '이미지' : '상세페이지'} · {item.status}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-400">
                {formatTime(item.updatedAt, { month: '2-digit', day: '2-digit' })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
