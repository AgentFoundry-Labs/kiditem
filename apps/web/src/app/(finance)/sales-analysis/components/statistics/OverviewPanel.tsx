import { formatKRW, formatPercent } from '@/lib/utils';
import { StatBox } from './StatBox';
import type { StatisticsOverview } from '@kiditem/shared/statistics';

type OverviewPanelProps = {
  overview: StatisticsOverview;
};

export function OverviewPanel({ overview }: OverviewPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatBox label="전체 상품" value={overview.totalProducts} unit="개" />
        <StatBox label="전체 주문" value={overview.totalOrders} unit="건" />
        <StatBox label="총 매출" value={formatKRW(overview.totalRevenue)} unit="원" />
        <StatBox label="총 이익" value={formatKRW(overview.totalProfit)} unit="원" />
        <StatBox
          label="평균 마진"
          value={formatPercent(overview.avgMargin * 100)}
          unit=""
        />
      </div>
    </div>
  );
}
