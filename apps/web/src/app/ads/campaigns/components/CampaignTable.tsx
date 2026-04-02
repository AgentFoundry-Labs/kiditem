'use client';

import { formatKRW } from '@/lib/utils';

interface CampaignItem {
  campaignName: string;
  date: string;
  adSpend: number;
  adRevenue: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  conversions: number;
  roas: number | null;
  conversionRate: number | null;
  budget: number | null;
  todaySpend: number | null;
}

interface Props {
  campaigns: CampaignItem[];
  sortBy: 'revenue' | 'roas';
  onSortChange: (sort: 'revenue' | 'roas') => void;
  selectedCampaign: string | null;
  onSelectCampaign: (name: string | null) => void;
}

export function CampaignTable({ campaigns, sortBy, onSortChange, selectedCampaign, onSelectCampaign }: Props) {
  const sorted = [...campaigns].sort((a, b) =>
    sortBy === 'revenue' ? b.adRevenue - a.adRevenue : (b.roas ?? 0) - (a.roas ?? 0),
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">캠페인 목록</h3>
        <div className="flex gap-1">
          {([['revenue', '매출순'], ['roas', 'ROAS순']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onSortChange(key)}
              className={`px-3 py-1 rounded text-xs font-medium ${sortBy === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-slate-50">
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
                className={`cursor-pointer transition-colors ${selectedCampaign === c.campaignName ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
              >
                <td className="font-medium text-slate-900 max-w-[240px] truncate">{c.campaignName}</td>
                <td className="text-right">{formatKRW(c.adSpend)}</td>
                <td className="text-right">{formatKRW(c.adRevenue)}</td>
                <td className={`text-right font-semibold ${(c.roas ?? 0) >= 300 ? 'text-green-600' : (c.roas ?? 0) >= 200 ? 'text-orange-500' : 'text-red-600'}`}>
                  {c.roas ?? 0}%
                </td>
                <td className="text-right">{(c.impressions ?? 0).toLocaleString()}</td>
                <td className="text-right">{(c.clicks ?? 0).toLocaleString()}</td>
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
