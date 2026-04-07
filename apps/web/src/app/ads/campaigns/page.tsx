'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW } from '@/lib/utils';
import { roasColor } from '../lib/status-colors';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { CampaignTable } from './components/CampaignTable';
import { ProductDrilldown } from './components/ProductDrilldown';

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

interface CampaignsResponse {
  period: string;
  totalKpi: Record<string, number>;
  campaigns: CampaignItem[];
}

export default function AdsCampaignsPage() {
  const searchParams = useSearchParams();
  const initialCampaign = searchParams.get('campaign');

  const [period, setPeriod] = useState('7d');
  const [sortBy, setSortBy] = useState<'revenue' | 'roas'>('revenue');
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(initialCampaign);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ads.campaigns(period),
    queryFn: () => apiClient.get<CampaignsResponse>(`/api/ads/campaigns?period=${period}`),
  });

  const { data: adsConfig } = useQuery({
    queryKey: queryKeys.ads.config(),
    queryFn: () => apiClient.get<{ roas: { thresholds: { excellent: number; warning: number; poor: number } } }>('/api/ads/config'),
  });
  const roasT = adsConfig?.roas?.thresholds ?? { excellent: 300, warning: 200, poor: 100 };

  if (isLoading) return <PageSkeleton variant="table" />;

  const campaigns = data?.campaigns ?? [];
  const kpi = data?.totalKpi ?? {};

  return (
    <div className="space-y-6">
      {/* Header + Period Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">캠페인 분석</h1>
        <div className="flex gap-1">
          {([['7d', '7일'], ['30d', '월간']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${period === key ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-slate-500">
          <p className="text-sm mb-2">캠페인 스냅샷 데이터가 없습니다.</p>
          <Link href="/ads/collect" className="text-sm text-purple-600 hover:text-purple-700">
            데이터 수집 페이지에서 먼저 수집해주세요 →
          </Link>
        </div>
      ) : (
        <>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="card-label">총 광고비</div>
          <div className="card-value">{formatKRW(kpi.adSpend)}원</div>
        </div>
        <div className="card">
          <div className="card-label">광고 매출</div>
          <div className="card-value">{formatKRW(kpi.adRevenue)}원</div>
        </div>
        <div className="card">
          <div className="card-label">ROAS</div>
          <div className={`card-value ${roasColor(kpi.roas ?? 0, roasT)}`}>
            {kpi.roas ?? 0}%
          </div>
        </div>
        <div className="card">
          <div className="card-label">CTR</div>
          <div className="card-value">{(kpi.ctr ?? 0).toFixed(1)}%</div>
        </div>
      </div>

      {/* Campaign Table */}
      <CampaignTable
        campaigns={campaigns}
        sortBy={sortBy}
        onSortChange={setSortBy}
        selectedCampaign={selectedCampaign}
        onSelectCampaign={setSelectedCampaign}
      />

      {/* Product Drilldown */}
      {selectedCampaign && (
        <ProductDrilldown campaignName={selectedCampaign} period={period} />
      )}
      </>
      )}
    </div>
  );
}
