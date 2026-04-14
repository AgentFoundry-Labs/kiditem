'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../lib/status-colors';
import type { CampaignProductData } from '../hooks/useAdOpsData';

interface Props {
  campaignName: string;
  period: string;
}

const PAGE_SIZES = [10, 20, 50, 100] as const;

export function ProductDrilldown({ campaignName, period }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const { data } = useQuery({
    queryKey: queryKeys.ads.campaignProducts(campaignName, period),
    queryFn: () =>
      apiClient.get<{ products: CampaignProductData[] }>(
        `/api/ads/campaigns?period=${period}&campaign=${encodeURIComponent(campaignName)}`,
      ),
  });

  const products = data?.products ?? [];
  const totalPages = Math.ceil(products.length / pageSize);
  const paged = products.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-200">
        <h4 className="font-semibold text-blue-900 text-sm">
          {campaignName} - 상품 상세
        </h4>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>표시:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="border border-slate-200 rounded px-2 py-1 text-xs"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}개</option>
            ))}
          </select>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">이 캠페인에 상품 데이터가 없습니다.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>상태</th>
                  <th>상품명</th>
                  <th>키워드</th>
                  <th className="text-right">광고비</th>
                  <th className="text-right">광고매출</th>
                  <th className="text-right">노출</th>
                  <th className="text-right">클릭</th>
                  <th className="text-right">CTR</th>
                  <th className="text-right">전환</th>
                  <th className="text-right">전환율</th>
                  <th className="text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => (
                  <tr key={`${p.vendorItemId}-${i}`}>
                    <td>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', p.onOff === 'ON' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600')}>
                        {p.onOff ?? '-'}
                      </span>
                    </td>
                    <td className="max-w-[200px]">
                      <div className="flex items-center gap-2">
                        {p.imageUrl && (
                          <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        )}
                        <span className="font-medium text-slate-900 truncate text-sm">{p.productName}</span>
                      </div>
                    </td>
                    <td className="text-xs text-slate-500 max-w-[120px] truncate">{p.keyword ?? '-'}</td>
                    <td className="text-right">{formatKRW(p.adSpend)}</td>
                    <td className="text-right">{formatKRW(p.adRevenue)}</td>
                    <td className="text-right">{formatNumber(p.impressions ?? 0)}</td>
                    <td className="text-right">{formatNumber(p.clicks ?? 0)}</td>
                    <td className="text-right">{(p.ctr ?? 0).toFixed(1)}%</td>
                    <td className="text-right">{p.adConversions ?? 0}</td>
                    <td className="text-right">{(p.conversionRate ?? 0).toFixed(1)}%</td>
                    <td className={cn('text-right font-semibold', roasColor(p.roas ?? 0, roasT))}>
                      {p.roas ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm">
              <span className="text-slate-500">{products.length}개 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, products.length)}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded border border-slate-200 text-xs disabled:opacity-40"
                >
                  이전
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded border border-slate-200 text-xs disabled:opacity-40"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
