'use client';

import { ExternalLink } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import type { SerpItem } from '../lib/rank-api';

/** SERP 캡처 아이템을 DOM 순서 그대로 렌더 — 자사 상품 하이라이트 + 광고 배지. */
export default function SerpItemsTable({
  items,
  ownVendorItemIds,
}: {
  items: SerpItem[];
  ownVendorItemIds: string[];
}) {
  const ownSet = new Set(ownVendorItemIds);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-slate-500 w-14">순위</th>
            <th className="px-2 py-2.5 text-left text-[12px] font-semibold text-slate-500 w-16">구분</th>
            <th className="px-2 py-2.5 text-left text-[12px] font-semibold text-slate-500">상품명</th>
            <th className="px-2 py-2.5 text-right text-[12px] font-semibold text-slate-500 w-28">가격</th>
            <th className="px-4 py-2.5 text-right text-[12px] font-semibold text-slate-500 w-24">리뷰수</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isOwn = !!item.vendorItemId && ownSet.has(item.vendorItemId);
            return (
              <tr
                key={`${item.rank}-${item.vendorItemId ?? item.productId ?? 'unknown'}`}
                className={cn(
                  'border-b border-slate-100',
                  isOwn ? 'bg-purple-50/70' : 'hover:bg-slate-50',
                )}
              >
                <td className="px-4 py-2 font-semibold tabular-nums text-slate-700">{item.rank}</td>
                <td className="px-2 py-2">
                  {item.isAd ? (
                    <span className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                      광고
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">일반</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <span className="inline-flex max-w-[520px] items-center gap-1.5">
                    {isOwn && (
                      <span className="inline-flex shrink-0 rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        자사
                      </span>
                    )}
                    {item.link ? (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          'inline-flex min-w-0 items-center gap-1 hover:underline',
                          isOwn ? 'font-semibold text-purple-900' : 'text-slate-700',
                        )}
                      >
                        <span className="truncate">{item.name ?? '(이름 없음)'}</span>
                        <ExternalLink size={11} className="shrink-0 text-slate-300" />
                      </a>
                    ) : (
                      <span
                        className={cn(
                          'truncate',
                          isOwn ? 'font-semibold text-purple-900' : 'text-slate-700',
                        )}
                      >
                        {item.name ?? '(이름 없음)'}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                  {item.priceKrw != null ? `${formatKRW(item.priceKrw)}원` : '-'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {item.reviewCount != null ? formatNumber(item.reviewCount) : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
