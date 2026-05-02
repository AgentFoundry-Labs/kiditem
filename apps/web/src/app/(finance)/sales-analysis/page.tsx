'use client';

import dynamic from 'next/dynamic';
import {
  LineChart,
  Receipt,
  BarChart3,
  FileSpreadsheet,
  Target,
  TrendingUp,
  Megaphone,
} from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const SalesOverviewPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/SalesOverview'), { ssr: false });
const SettlementsPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/Settlements'), { ssr: false });
const StatisticsPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/Statistics'), { ssr: false });
const ReportsPage = dynamic(() => import('@/app/reports/page'), { ssr: false });
const SalesPlansPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/SalesPlans'), { ssr: false });
const WingDailySalesPage = dynamic(() => import('@/app/(finance)/sales-analysis/components/WingDailySales'), { ssr: false });
const CoupangAdsMonthlyPage = dynamic(
  () => import('@/app/(finance)/sales-analysis/components/CoupangAdsMonthly'),
  { ssr: false },
);

export default function SalesAnalysisPage() {
  return (
    <TabLayout
      title="매출 분석"
      titleIcon={LineChart}
      defaultTab="wing-daily"
      tabs={[
        // Drive replay 데이터에서 의미 있는 화면을 좌측에 배치 — Wing 일매출이
        // 첫 진입 화면이 되도록 defaultTab 도 wing-daily 로 잡는다.
        { id: 'wing-daily', label: 'Wing 일매출', icon: TrendingUp, content: <WingDailySalesPage /> },
        { id: 'coupang-ads', label: '쿠팡 광고 KPI', icon: Megaphone, content: <CoupangAdsMonthlyPage /> },
        { id: 'overview', label: '매출 분석 (주문 기반)', icon: LineChart, content: <SalesOverviewPage /> },
        { id: 'statistics', label: '통계', icon: BarChart3, content: <StatisticsPage /> },
        { id: 'reports', label: '리포트', icon: FileSpreadsheet, content: <ReportsPage /> },
        { id: 'plans', label: '사업계획', icon: Target, content: <SalesPlansPage /> },
        { id: 'settlements', label: '정산 현황', icon: Receipt, content: <SettlementsPage /> },
      ]}
    />
  );
}
