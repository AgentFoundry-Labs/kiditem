'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../lib/status-colors';
import type { AdCampaignSnapshot } from '@kiditem/shared/advertising';

interface Props {
  campaigns: AdCampaignSnapshot[];
  sortBy: 'revenue' | 'roas';
  onSortChange: (sort: 'revenue' | 'roas') => void;
  selectedCampaign: CampaignSelection | null;
  onSelectCampaign: (campaign: CampaignSelection | null) => void;
}

export interface CampaignSelection {
  channelAccountId: string;
  campaignIdentity: string;
  campaignName: string;
}

function isSelected(
  selected: CampaignSelection | null,
  campaign: Pick<AdCampaignSnapshot, 'channelAccountId' | 'campaignIdentity'>,
) {
  return selected?.channelAccountId === campaign.channelAccountId &&
    selected.campaignIdentity === campaign.campaignIdentity;
}

export function CampaignTable({ campaigns, sortBy, onSortChange, selectedCampaign, onSelectCampaign }: Props) {
  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const sorted = [...campaigns].sort((a, b) => {
    const aHasMetrics = a.metricsAvailable !== false;
    const bHasMetrics = b.metricsAvailable !== false;
    if (aHasMetrics !== bHasMetrics) return aHasMetrics ? -1 : 1;
    return sortBy === 'revenue'
      ? b.metrics.revenue - a.metrics.revenue
      : (b.metrics.roas ?? 0) - (a.metrics.roas ?? 0);
  });

  return (
    <div className="table-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">캠페인 목록</h3>
        <div className="flex gap-1">
          {([['revenue', '매출순'], ['roas', 'ROAS순']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onSortChange(key)}
              className={cn('px-3 py-1 rounded text-xs font-medium', sortBy === key ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>캠페인명</th>
              <th className="text-right">광고비</th>
              <th className="text-right">광고매출</th>
              <th className="text-right">ROAS</th>
              <th className="text-right">노출</th>
              <th className="text-right">클릭</th>
              <th className="text-right">CTR</th>
              <th
                className="text-right"
                title="쿠팡 광고센터의 캠페인 목록에는 전환 판매수 컬럼이 없습니다. 캠페인을 클릭하면 상품별 전환 판매수를 볼 수 있습니다."
              >
                전환
              </th>
              <th className="text-right">전환율</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">캠페인 데이터가 없습니다.</td>
              </tr>
            )}
            {sorted.map((c) => {
              const rowKey = `${c.channelAccountId}:${c.campaignIdentity}`;
              const displayName = c.campaignName ?? c.listing?.channelName ?? c.listing?.masterProduct.name ?? '알 수 없는 캠페인';
              const hasMetrics = c.metricsAvailable !== false;
              const campaignState = (c.onOff ?? c.status)?.trim().toUpperCase() || null;
              const selection = {
                channelAccountId: c.channelAccountId,
                campaignIdentity: c.campaignIdentity,
                campaignName: displayName,
              } satisfies CampaignSelection;
              return (
                <tr
                  key={rowKey}
                  onClick={hasMetrics
                    ? () => onSelectCampaign(isSelected(selectedCampaign, c) ? null : selection)
                    : undefined}
                  aria-disabled={!hasMetrics}
                  title={hasMetrics ? '상품별 광고 성과 보기' : '캠페인 상태만 수집되어 상품별 성과를 열 수 없습니다.'}
                  className={cn(
                    'transition-colors',
                    hasMetrics ? 'cursor-pointer' : 'cursor-default',
                    isSelected(selectedCampaign, c)
                      ? 'bg-purple-50'
                      : hasMetrics
                        ? 'hover:bg-slate-50'
                        : 'bg-slate-50/50',
                  )}
                >
                  <td className="max-w-[280px] font-medium text-slate-900">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="max-w-[240px] truncate">{displayName}</span>
                      {campaignState && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={campaignState === 'ON'
                            ? { background: 'var(--primary-soft)', color: 'var(--success)' }
                            : { background: 'var(--surface-sunken)', color: 'var(--text-tertiary)' }}
                        >
                          {campaignState}
                        </span>
                      )}
                      {!hasMetrics && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: 'var(--surface-sunken)', color: 'var(--text-tertiary)' }}
                        >
                          성과 미수집
                        </span>
                      )}
                      {c.listing == null && hasMetrics && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          캠페인 단위
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right">{hasMetrics ? formatKRW(c.metrics.spend) : '-'}</td>
                  <td className="text-right">{hasMetrics ? formatKRW(c.metrics.revenue) : '-'}</td>
                  <td className={cn(
                    'text-right font-semibold',
                    hasMetrics && roasColor(c.metrics.roas ?? 0, roasT),
                  )}>
                    {hasMetrics ? `${c.metrics.roas ?? 0}%` : '-'}
                  </td>
                  <td className="text-right">{hasMetrics ? formatNumber(c.metrics.impressions) : '-'}</td>
                  <td className="text-right">{hasMetrics ? formatNumber(c.metrics.clicks) : '-'}</td>
                  <td className="text-right">{hasMetrics ? `${(c.metrics.ctr ?? 0).toFixed(2)}%` : '-'}</td>
                  {/* Coupang's campaign list grid has no conversion-count
                      column, so a 0 here is "not collected", not "zero sales".
                      Show unknown instead of fabricating a number. */}
                  <td className="text-right" style={hasMetrics && c.conversionsAvailable ? undefined : { color: 'var(--text-tertiary)' }}>
                    {hasMetrics && c.conversionsAvailable ? formatNumber(c.metrics.conversions) : '-'}
                  </td>
                  <td className="text-right">{hasMetrics ? `${(c.metrics.cvr ?? 0).toFixed(2)}%` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
