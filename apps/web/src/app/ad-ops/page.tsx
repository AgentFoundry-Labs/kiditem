'use client';

import { useState } from 'react';
import {
  RefreshCw, Brain, Sparkles, Megaphone,
  AlertTriangle, LayoutGrid, Package,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import ScrapeCollector from '@/app/ads/collect/components/ScrapeCollector';
import { useAdOpsData, useCampaignProducts, useRefreshAdOps } from './hooks/useAdOpsData';
import { KpiCards } from './components/KpiCards';
import { OverviewTab } from './components/OverviewTab';
import { StrategyTab } from './components/StrategyTab';
import { CampaignsTab } from './components/CampaignsTab';
import { ProductsTab } from './components/ProductsTab';

import type { TabKey } from './lib/types';

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'overview', label: '개요', icon: LayoutGrid },
  { key: 'strategy', label: 'AI 전략', icon: Sparkles },
  { key: 'campaigns', label: '캠페인', icon: Megaphone },
  { key: 'products', label: '상품 현황', icon: Package },
];

export default function AdOpsPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [period, setPeriod] = useState('14d');
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);

  const data = useAdOpsData(period, tab);
  const refreshAdOps = useRefreshAdOps();
  const campaignProducts = useCampaignProducts(selectedCampaign, period);

  const totalKpi = data.campaigns.data?.totalKpi || {};
  const roas = totalKpi.roas || 0;
  const campaigns = data.campaigns.data?.campaigns || [];
  const sorted = [...campaigns].sort((a, b) => {
    if (b.adRevenue !== a.adRevenue) return b.adRevenue - a.adRevenue;
    if ((b.roas ?? 0) !== (a.roas ?? 0)) return (b.roas ?? 0) - (a.roas ?? 0);
    return b.clicks - a.clicks;
  });
  const rules = data.rules.data?.recommendations || [];
  const wingKpis = data.extensionStatus.data?.wing?.kpis || {};
  const wingAdData = data.dashboard.data?.trafficKpi?.adSummary as Record<string, string> | null ?? null;
  const urgentCount = rules.filter(r => r.priority === 'urgent').length;

  if (data.isLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">광고 전략 AI</h1>
            <p className="text-[13px] text-slate-400">실시간 데이터 기반 ABC 등급 분석 · 자동 전략 제안</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ScrapeCollector onComplete={refreshAdOps} />
          {urgentCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold animate-pulse bg-red-50 text-red-600 border border-red-600">
              <AlertTriangle size={13} /> 긴급 {urgentCount}건
            </span>
          )}
          <div className="flex rounded-lg p-0.5 bg-slate-100">
            {[{ key: '7d', label: '7일' }, { key: '14d', label: '14일' }, { key: 'month', label: '이번달' }].map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === p.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={refreshAdOps} className="p-2.5 rounded-lg transition-colors text-slate-400" title="새로고침">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <KpiCards totalKpi={totalKpi} wingAdData={wingAdData} roas={roas} />

      {/* Tab navigation */}
      <div className="flex gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-lg border transition-all ${isActive ? 'text-white border-blue-600 bg-blue-600' : 'bg-white hover:bg-slate-50 border-slate-100 text-slate-500'}`}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <OverviewTab
          trends={data.trends.data}
          wingKpis={wingKpis}
          rules={rules}
          strategy={data.strategy.data}
        />
      )}

      {tab === 'strategy' && (
        <StrategyTab
          rules={rules}
          strategy={data.strategy.data}
          strategyCards={data.recommend.data?.cards || []}
        />
      )}

      {tab === 'campaigns' && (
        <CampaignsTab
          campaigns={sorted}
          selectedCampaign={selectedCampaign}
          onSelectCampaign={setSelectedCampaign}
          products={campaignProducts.data?.products || []}
        />
      )}

      {tab === 'products' && data.adsList.data && (
        <ProductsTab
          products={data.adsList.data.products}
          summary={data.adsList.data.summary}
        />
      )}
    </div>
  );
}
