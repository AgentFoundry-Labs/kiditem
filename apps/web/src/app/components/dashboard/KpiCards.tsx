import KpiCard from './KpiCard';
import { formatKRW, formatNumber } from '@/lib/utils';
import {
  Wallet,
  TrendingUp,
  DollarSign,
  Megaphone,
  Target,
  BarChart3,
  ShoppingCart,
} from 'lucide-react';
import type { DashboardSummary } from '@kiditem/shared';

interface KpiCardsProps {
  summary: DashboardSummary['summary'];
}

export default function KpiCards({ summary: s }: KpiCardsProps) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="월 매출" value={formatKRW(s.monthlyRevenue)} unit="원"
          icon={Wallet} bgColor="bg-blue-50 border-blue-200" accentColor="#2563eb"
          prevLabel={`${formatKRW(s.prevMonthlyRevenue)}원`}
        />
        <KpiCard
          label="월 순이익" value={formatKRW(s.monthlyProfit)} unit="원"
          icon={TrendingUp} bgColor="bg-emerald-50 border-emerald-200" accentColor="#059669"
          prevLabel={`${formatKRW(s.prevMonthlyProfit)}원`}
        />
        <KpiCard
          label="오늘 매출" value={formatKRW(s.todayRevenue)} unit="원"
          icon={DollarSign} bgColor="bg-amber-50 border-amber-200" accentColor="#d97706"
          subValue={`주문 ${formatNumber(s.todayOrders)}건`}
        />
        <KpiCard
          label="광고비율" value={String(s.adRate)} unit="%"
          icon={Megaphone}
          bgColor={s.adRate > 15 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}
          accentColor={s.adRate > 15 ? '#dc2626' : '#6b7280'}
          prevLabel={`${s.prevAdRate}%`}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="ROAS" value={String(s.roas)} unit="%"
          icon={Target} bgColor="bg-blue-50 border-blue-200" accentColor="#2563eb"
          prevLabel={`${s.prevRoas}%`}
        />
        <KpiCard
          label="클릭률 (CTR)" value={String(s.ctr)} unit="%"
          icon={BarChart3} bgColor="bg-blue-50 border-blue-200" accentColor="#2563eb"
          prevLabel={`${s.prevCtr}%`}
        />
        <KpiCard
          label="광고 전환매출" value={formatKRW(s.adRevenue)} unit="원"
          icon={ShoppingCart} bgColor="bg-emerald-50 border-emerald-200" accentColor="#059669"
          prevLabel={`${formatKRW(s.prevAdRevenue)}원`}
        />
        <KpiCard
          label="광고비" value={formatKRW(s.totalAdSpend)} unit="원"
          icon={Megaphone} bgColor="bg-orange-50 border-orange-200" accentColor="#ea580c"
          prevLabel={`${formatKRW(s.prevTotalAdSpend)}원`}
        />
      </div>
    </>
  );
}
