'use client';

import dynamic from 'next/dynamic';
import { LineChart, Receipt, BarChart3, FileSpreadsheet, Target, TrendingUp } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const SalesOverviewPage = dynamic(() => import('@/app/sales-analysis/components/SalesOverview'), { ssr: false });
const SettlementsPage = dynamic(() => import('@/app/sales-analysis/components/Settlements'), { ssr: false });
const StatisticsPage = dynamic(() => import('@/app/sales-analysis/components/Statistics'), { ssr: false });
const ReportsPage = dynamic(() => import('@/app/reports/page'), { ssr: false });
const SalesPlansPage = dynamic(() => import('@/app/sales-analysis/components/SalesPlans'), { ssr: false });
const WingDailySalesPage = dynamic(() => import('@/app/sales-analysis/components/WingDailySales'), { ssr: false });

export default function SalesAnalysisPage() {
  return (
    <TabLayout
      title="매출 분석"
      titleIcon={LineChart}
      tabs={[
        { id: 'overview', label: '매출 분석', icon: LineChart, content: <SalesOverviewPage /> },
        { id: 'wing-daily', label: 'Wing 일매출', icon: TrendingUp, content: <WingDailySalesPage /> },
        { id: 'settlements', label: '정산 현황', icon: Receipt, content: <SettlementsPage /> },
        { id: 'statistics', label: '통계', icon: BarChart3, content: <StatisticsPage /> },
        { id: 'reports', label: '리포트', icon: FileSpreadsheet, content: <ReportsPage /> },
        { id: 'plans', label: '사업계획', icon: Target, content: <SalesPlansPage /> },
      ]}
    />
  );
}
