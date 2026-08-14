'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LineChart,
  Receipt,
  BarChart3,
  FileSpreadsheet,
  Target,
  TrendingUp,
} from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import type { SalesAnalysisTabId } from '../lib/sales-analysis-tabs';

const SalesOverviewPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/SalesOverview'), { ssr: false });
const SettlementsPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/Settlements'), { ssr: false });
const StatisticsPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/Statistics'), { ssr: false });
const ReportsPage = dynamic(() => import('@/app/(finance)/reports/page'), { ssr: false });
const SalesPlansPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/SalesPlans'), { ssr: false });
const WingDailySalesPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/WingDailySales'), { ssr: false });

interface SalesAnalysisPageContentProps {
  initialTab: SalesAnalysisTabId;
}

export default function SalesAnalysisPageContent({ initialTab }: SalesAnalysisPageContentProps) {
  const [activeTab, setActiveTab] = useState<SalesAnalysisTabId>(initialTab);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const changeTab = (tab: SalesAnalysisTabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    if (tab !== 'overview') params.delete('channel');
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
          <LineChart size={22} className="text-purple-600" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">매출 분석</h1>
      </div>

      <TabLayout
        title="매출 분석"
        showTitle={false}
        activeTab={activeTab}
        onTabChange={(tab) => changeTab(tab as SalesAnalysisTabId)}
        tabs={[
          { id: 'overview', label: '매출 분석', icon: LineChart, content: <SalesOverviewPage /> },
          { id: 'wing-daily', label: 'Wing 일매출', icon: TrendingUp, content: <WingDailySalesPage /> },
          { id: 'statistics', label: '통계', icon: BarChart3, content: <StatisticsPage /> },
          { id: 'reports', label: '리포트', icon: FileSpreadsheet, content: <ReportsPage /> },
          { id: 'plans', label: '사업계획', icon: Target, content: <SalesPlansPage /> },
          { id: 'settlements', label: '정산 현황', icon: Receipt, content: <SettlementsPage /> },
        ]}
      />
    </div>
  );
}
