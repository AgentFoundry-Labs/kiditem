'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Package, RefreshCw } from 'lucide-react';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../lib/status-colors';
import { cardRaised } from '../lib/card-styles';
import { useAdProducts, useAdsConfig } from '../hooks/useAdOpsData';

type SortKey = 'revenue' | 'spend' | 'roas';
type StatusFilter = 'all' | 'on' | 'off';
const PAGE_SIZES = [20, 50, 100] as const;

interface Props {
  period: string;
}

export default function AdProductsContent({ period }: Props) {
  const { products, isLoading, isFetching } = useAdProducts(period, true);
  const roasT = useAdsConfig();
  const isRefreshing = isFetching && !isLoading;

  const [sortBy, setSortBy] = useState<SortKey>('revenue');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (statusFilter === 'on' && p.onOff !== 'ON') return false;
        if (statusFilter === 'off' && p.onOff === 'ON') return false;
        if (!q) return true;
        const hay = `${p.productName ?? ''} ${p.campaignName ?? ''} ${p.keyword ?? ''} ${p.vendorItemId ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (sortBy === 'revenue') return (b.adRevenue ?? 0) - (a.adRevenue ?? 0);
        if (sortBy === 'spend') return (b.adSpend ?? 0) - (a.adSpend ?? 0);
        return (b.roas ?? 0) - (a.roas ?? 0);
      });
  }, [products, statusFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const totals = useMemo(() => {
    const acc = filtered.reduce(
      (a, p) => ({
        spend: a.spend + (p.adSpend ?? 0),
        revenue: a.revenue + (p.adRevenue ?? 0),
        impressions: a.impressions + (p.impressions ?? 0),
        clicks: a.clicks + (p.clicks ?? 0),
      }),
      { spend: 0, revenue: 0, impressions: 0, clicks: 0 },
    );
    return {
      ...acc,
      roas: acc.spend > 0 ? Math.round((acc.revenue / acc.spend) * 10000) / 100 : 0,
      onCount: filtered.filter((p) => p.onOff === 'ON').length,
    };
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>광고상품 데이터 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} aria-live="polite">
          <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
          광고상품 데이터를 갱신 중입니다.
        </div>
      )}
      <div className="space-y-4" aria-busy={isRefreshing}>
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: '광고 상품', value: `${formatNumber(filtered.length)}개`, sub: `ON ${totals.onCount}` },
          { label: '광고비', value: `${formatKRW(totals.spend)}원` },
          { label: '광고매출', value: `${formatKRW(totals.revenue)}원` },
          { label: 'ROAS', value: `${totals.roas}%`, colorClass: roasColor(totals.roas, roasT) },
          { label: '클릭', value: formatNumber(totals.clicks) },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl px-5 py-4" style={cardRaised}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>
              {k.label}
            </div>
            <div
              className={cn('text-[20px] font-black tabular-nums leading-tight', k.colorClass ?? '')}
              style={!k.colorClass ? { color: 'var(--text-primary)' } : {}}
            >
              {k.value}
            </div>
            {k.sub && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{k.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3" style={cardRaised}>
        <div className="flex items-center gap-2">
          <Package size={14} style={{ color: 'var(--primary)' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>광고 진행 중인 상품</h3>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="상품명·캠페인·키워드 검색"
            className="px-3 py-1.5 text-xs rounded-lg outline-none"
            style={{
              background: 'var(--surface-sunken)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              minWidth: 220,
            }}
          />

          <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface-sunken)' }}>
            {([['all', '전체'], ['on', 'ON'], ['off', 'OFF']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => { setStatusFilter(k); setPage(0); }}
                className="px-3 py-1 text-xs font-semibold rounded-md transition-all"
                style={statusFilter === k ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-tertiary)' }}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface-sunken)' }}>
            {([['revenue', '매출순'], ['spend', '광고비순'], ['roas', 'ROAS순']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className="px-3 py-1 text-xs font-semibold rounded-md transition-all"
                style={sortBy === k ? { background: 'var(--primary)', color: '#fff' } : { color: 'var(--text-tertiary)' }}
              >
                {l}
              </button>
            ))}
          </div>

          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="px-2 py-1 text-xs rounded-lg"
            style={{
              background: 'var(--surface-sunken)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}개</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={cardRaised}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package size={28} style={{ color: 'var(--text-quaternary)' }} />
            <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>표시할 광고상품이 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}>
                    <Th>상태</Th>
                    <Th>상품</Th>
                    <Th>캠페인</Th>
                    <Th>키워드</Th>
                    <Th align="right">광고비</Th>
                    <Th align="right">광고매출</Th>
                    <Th align="right">노출</Th>
                    <Th align="right">클릭</Th>
                    <Th align="right">CTR</Th>
                    <Th align="right">전환</Th>
                    <Th align="right">전환율</Th>
                    <Th align="right">ROAS</Th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((p, i) => {
                    const isOn = p.onOff === 'ON';
                    return (
                      <tr key={`${p.vendorItemId ?? p.productName ?? i}-${p.campaignName}-${i}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <Td>
                          <span
                            className="px-2 py-0.5 rounded text-xs font-semibold"
                            style={
                              isOn
                                ? { background: 'var(--success-subtle, #e6f7ed)', color: 'var(--success, #00b96b)' }
                                : { background: 'var(--surface-sunken)', color: 'var(--text-tertiary)' }
                            }
                          >
                            {p.onOff ?? '-'}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2 max-w-[280px]">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded flex-shrink-0" style={{ background: 'var(--surface-sunken)' }} />
                            )}
                            <span className="font-medium truncate text-[13px]" style={{ color: 'var(--text-primary)' }}>
                              {p.productName ?? '(이름 없음)'}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-[12px] truncate inline-block max-w-[160px]" style={{ color: 'var(--text-secondary)' }}>
                            {p.campaignName || '-'}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-[12px] truncate inline-block max-w-[140px]" style={{ color: 'var(--text-tertiary)' }}>
                            {p.keyword ?? '-'}
                          </span>
                        </Td>
                        <Td align="right" mono>{formatKRW(p.adSpend ?? 0)}</Td>
                        <Td align="right" mono>{formatKRW(p.adRevenue ?? 0)}</Td>
                        <Td align="right" mono>{formatNumber(p.impressions ?? 0)}</Td>
                        <Td align="right" mono>{formatNumber(p.clicks ?? 0)}</Td>
                        <Td align="right" mono>{(p.ctr ?? 0).toFixed(1)}%</Td>
                        <Td align="right" mono>{p.adConversions ?? 0}</Td>
                        <Td align="right" mono>{(p.conversionRate ?? 0).toFixed(1)}%</Td>
                        <Td align="right">
                          <span className={cn('font-semibold tabular-nums', roasColor(p.roas ?? 0, roasT))}>
                            {p.roas ?? 0}%
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div
                className="flex items-center justify-between px-4 py-3 text-sm"
                style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
              >
                <span>
                  {filtered.length}개 중 {safePage * pageSize + 1}-{Math.min((safePage + 1) * pageSize, filtered.length)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    className="px-3 py-1 rounded-md text-xs disabled:opacity-40"
                    style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    이전
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                    disabled={safePage >= totalPages - 1}
                    className="px-3 py-1 rounded-md text-xs disabled:opacity-40"
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
      </div>
    </div>
  );
}

function Th({ children, align }: { children: ReactNode; align?: 'right' }) {
  return (
    <th
      className={cn('px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider', align === 'right' ? 'text-right' : 'text-left')}
      style={{ color: 'var(--text-tertiary)' }}
    >
      {children}
    </th>
  );
}

function Td({ children, align, mono }: { children: ReactNode; align?: 'right'; mono?: boolean }) {
  return (
    <td
      className={cn('px-3 py-2.5', align === 'right' ? 'text-right' : 'text-left', mono && 'tabular-nums')}
      style={{ color: 'var(--text-primary)' }}
    >
      {children}
    </td>
  );
}
