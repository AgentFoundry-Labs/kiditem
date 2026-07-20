'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  LineChart,
  Receipt,
  BarChart3,
  FileSpreadsheet,
  Target,
  TrendingUp,
  Rocket,
} from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import type { SalesAnalysisTabId } from '../lib/sales-analysis-tabs';

const SalesOverviewPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/SalesOverview'), { ssr: false });
const SettlementsPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/Settlements'), { ssr: false });
const StatisticsPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/Statistics'), { ssr: false });
const ReportsPage = dynamic(() => import('@/app/(finance)/reports/page'), { ssr: false });
const SalesPlansPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/SalesPlans'), { ssr: false });
const WingDailySalesPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/WingDailySales'), { ssr: false });
const RocketDailySalesPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/RocketDailySales'), { ssr: false });

interface SalesAnalysisPageContentProps {
  initialTab: SalesAnalysisTabId;
}

export default function SalesAnalysisPageContent({ initialTab }: SalesAnalysisPageContentProps) {
  const [activeTab, setActiveTab] = useState<SalesAnalysisTabId>(initialTab);

  return (
    <TabLayout
      title="매출 분석"
      titleIcon={LineChart}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as SalesAnalysisTabId)}
      tabs={[
        // Drive replay 데이터에서 의미 있는 화면을 좌측에 배치 — Wing 일매출이
        // 첫 진입 화면이 되도록 defaultTab 도 wing-daily 로 잡는다.
        { id: 'wing-daily', label: 'Wing 일매출', icon: TrendingUp, content: <WingDailySalesPage /> },
        { id: 'rocket-daily', label: '쿠팡 로켓', icon: Rocket, content: <RocketDailySalesPage /> },
        { id: 'overview', label: '매출 분석 (주문 기반)', icon: LineChart, content: <SalesOverviewPage /> },
        { id: 'statistics', label: '통계', icon: BarChart3, content: <StatisticsPage /> },
        { id: 'reports', label: '리포트', icon: FileSpreadsheet, content: <ReportsPage /> },
        { id: 'plans', label: '사업계획', icon: Target, content: <SalesPlansPage /> },
        { id: 'settlements', label: '정산 현황', icon: Receipt, content: <SettlementsPage /> },
      ]}
    />
  );
}
