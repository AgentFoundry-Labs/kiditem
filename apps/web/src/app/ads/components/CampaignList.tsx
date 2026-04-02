'use client';

import Link from 'next/link';
import { formatKRW } from '@/lib/utils';

interface CampaignItem {
  campaignName: string;
  adSpend: number;
  adRevenue: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  roas: number;
  conversionRate: number;
  budget: number | null;
  todaySpend: number | null;
}

export function CampaignList({ campaigns }: { campaigns: CampaignItem[] }) {
  if (campaigns.length === 0) return null;

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">캠페인 현황</h3>
        <Link href="/ads/campaigns" className="text-sm text-blue-600 hover:text-blue-700">
          전체보기 →
        </Link>
      </div>
      <div className="space-y-3">
        {campaigns.slice(0, 5).map((c) => (
          <Link
            key={c.campaignName}
            href={`/ads/campaigns?campaign=${encodeURIComponent(c.campaignName)}`}
            className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
          >
            <div>
              <div className="font-medium text-sm text-slate-900">{c.campaignName}</div>
              <div className="text-xs text-slate-500">
                클릭 {c.clicks.toLocaleString()} · 전환 {c.conversions}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{formatKRW(c.adRevenue)}원</div>
              <div className={`text-xs font-medium ${c.roas >= 300 ? 'text-green-600' : c.roas >= 200 ? 'text-orange-500' : 'text-red-500'}`}>
                ROAS {c.roas}%
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
