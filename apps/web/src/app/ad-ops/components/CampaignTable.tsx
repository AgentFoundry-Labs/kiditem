'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { roasColor } from '../lib/status-colors';
import type { AdCampaignSnapshot } from '@kiditem/shared';

interface Props {
  campaigns: AdCampaignSnapshot[];
  sortBy: 'revenue' | 'roas';
  onSortChange: (sort: 'revenue' | 'roas') => void;
  selectedCampaign: string | null;
  onSelectCampaign: (name: string | null) => void;
}

export function CampaignTable({ campaigns, sortBy, onSortChange, selectedCampaign, onSelectCampaign }: Props) {
  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  const sorted = [...campaigns].sort((a, b) =>
    sortBy === 'revenue' ? b.adRevenue - a.adRevenue : (b.roas ?? 0) - (a.roas ?? 0),
  );

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
              <th className="text-right">전환</th>
              <th className="text-right">전환율</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-500">캠페인 데이터가 없습니다.</td>
              </tr>
            )}
            {sorted.map((c) => (
              <tr
                key={c.campaignName}
                onClick={() => onSelectCampaign(selectedCampaign === c.campaignName ? null : c.campaignName)}
                className={cn('cursor-pointer transition-colors', selectedCampaign === c.campaignName ? 'bg-blue-50' : 'hover:bg-slate-50')}
              >
                <td className="font-medium text-slate-900 max-w-[240px] truncate">{c.campaignName}</td>
                <td className="text-right">{formatKRW(c.adSpend)}</td>
                <td className="text-right">{formatKRW(c.adRevenue)}</td>
                <td className={cn('text-right font-semibold', roasColor(c.roas ?? 0, roasT))}>
                  {c.roas ?? 0}%
                </td>
                <td className="text-right">{formatNumber(c.impressions ?? 0)}</td>
                <td className="text-right">{formatNumber(c.clicks ?? 0)}</td>
                <td className="text-right">{(c.ctr ?? 0).toFixed(1)}%</td>
                <td className="text-right">{c.conversions ?? 0}</td>
                <td className="text-right">{(c.conversionRate ?? 0).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
