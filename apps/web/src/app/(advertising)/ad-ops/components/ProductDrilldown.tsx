'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../lib/status-colors';
import { displayKeyword, stripEmbeddedOptionId } from '../lib/ad-product-display';
import type { AdProductSnapshot } from '@kiditem/shared/advertising';

interface Props {
  campaignName: string;
  period: string;
}

const PAGE_SIZES = [10, 20, 50, 100] as const;

/**
 * Per-campaign product detail table, mirroring the Coupang ad-center campaign
 * detail grid.
 *
 * Source is `/api/ads/products?campaign=` — product-GRAIN rows only. This used
 * to read `/api/ads/campaigns?campaign=`, which returns campaign-grain rollups,
 * so the "product" rows were really the campaign's own aggregate row. Mixing
 * the two grains is what produced the 2026-07-17 double count.
 *
 * Only campaigns whose detail grid was actually swept have rows here. Live
 * 2026-07-17: `쿠팡윙 집중광고` has 29 product rows; no other campaign has any.
 * Those campaigns get an explicit "not collected" empty state rather than a
 * fabricated zero table.
 */
export function ProductDrilldown({ campaignName, period }: Props) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () =>
      apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>(
        '/api/ads/config',
      ),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ads.campaignProducts(campaignName, period),
    queryFn: () =>
      apiClient.get<AdProductSnapshot[]>(
        `/api/ads/products?period=${period}&campaign=${encodeURIComponent(campaignName)}`,
      ),
  });

  const products = data ?? [];
  const totalPages = Math.ceil(products.length / pageSize);
  const paged = products.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {campaignName} · 상품별 성과
          </h4>
          {products.length > 0 && (
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              {products.length}개 상품
            </span>
          )}
        </div>
        {products.length > 0 && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span>표시:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="rounded px-2 py-1 text-xs"
              style={{ border: '1px solid var(--border-subtle)', background: 'var(--surface)', color: 'var(--text-secondary)' }}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}개</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          상품별 데이터 로딩 중...
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-10 px-4">
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            이 캠페인의 상품별 데이터가 수집되지 않았습니다.
          </p>
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
            상품별 지표는 쿠팡 광고센터의 캠페인 상세 화면에서만 제공됩니다.
            광고 동기화가 해당 캠페인 상세까지 도달해야 채워집니다.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>ON/OFF</th>
                  <th>상품명</th>
                  <th>상태</th>
                  <th>판매 방식</th>
                  <th>키워드</th>
                  <th className="text-right">집행 광고비</th>
                  <th className="text-right">광고 전환 매출</th>
                  <th className="text-right">노출수</th>
                  <th className="text-right">클릭수</th>
                  <th className="text-right">클릭률</th>
                  <th className="text-right">광고 전환 판매수</th>
                  <th className="text-right">전환율</th>
                  <th className="text-right">광고수익률</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((p, i) => (
                  <tr key={`${p.externalOptionId ?? p.externalId ?? 'row'}-${i}`}>
                    <td>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          p.onOff?.toUpperCase() === 'ON'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {p.onOff ?? '-'}
                      </span>
                    </td>
                    <td className="max-w-[260px]">
                      <div className="flex items-center gap-2">
                        {p.imageUrl && (
                          <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate text-sm" style={{ color: 'var(--text-primary)' }}>
                            {/* 쿠팡은 상품명 셀에 옵션ID 를 같이 렌더한다.
                                아래 줄에서 따로 보여주므로 중복을 걷어낸다. */}
                            {stripEmbeddedOptionId(p.productName, p.externalOptionId) ?? '이름 없음'}
                          </div>
                          {p.externalOptionId && (
                            <div className="text-[11px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                              ID: {p.externalOptionId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.status ?? '-'}</td>
                    <td className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.saleType ?? '-'}</td>
                    {/* 쿠팡의 키워드 칸은 `키워드 보기` 링크라 키워드 값이
                        아니다. 그 라벨을 키워드처럼 보여주지 않는다. */}
                    <td className="text-xs max-w-[120px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {displayKeyword(p.keyword) ?? '-'}
                    </td>
                    <td className="text-right">{formatKRW(p.metrics.spend)}원</td>
                    <td className="text-right">{formatKRW(p.metrics.revenue)}원</td>
                    <td className="text-right">{formatNumber(p.metrics.impressions)}회</td>
                    <td className="text-right">{formatNumber(p.metrics.clicks)}회</td>
                    <td className="text-right">{(p.metrics.ctr ?? 0).toFixed(2)}%</td>
                    <td className="text-right">{formatNumber(p.metrics.conversions)}회</td>
                    <td className="text-right">{(p.metrics.cvr ?? 0).toFixed(2)}%</td>
                    <td className={cn('text-right font-semibold', roasColor(p.metrics.roas ?? 0, roasT))}>
                      {p.metrics.roas ?? 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3 text-sm"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <span style={{ color: 'var(--text-tertiary)' }}>
                {products.length}개 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, products.length)}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded text-xs disabled:opacity-40"
                  style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  이전
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded text-xs disabled:opacity-40"
                  style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
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
