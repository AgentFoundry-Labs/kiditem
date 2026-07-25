'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatKRW } from '@/lib/utils';

export interface SalesChannelChartPoint {
  date: string;
  rocket: number;
  others: number;
}

const CHART_HEIGHT = 300;
const CHART_INITIAL_DIMENSION = { width: 800, height: CHART_HEIGHT };

const LABELS: Record<string, string> = {
  rocket: '쿠팡 로켓',
  others: '쿠팡윙·기타몰',
};

export function SalesChannelTrendChart({ data }: { data: SalesChannelChartPoint[] }) {
  return (
    <ResponsiveContainer
      width="100%"
      height={CHART_HEIGHT}
      initialDimension={CHART_INITIAL_DIMENSION}
    >
      <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesChannelRocket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.24} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="salesChannelOthers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value: string) => value.slice(5)}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value: number) => `${Math.round(value / 10_000)}만`}
          domain={[0, 'auto']}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 10,
            background: '#fff',
            border: '1px solid #e2e8f0',
            color: '#0f172a',
          }}
          formatter={(value, name) => {
            const label = String(name ?? '');
            return [
              `${formatKRW(Number(value ?? 0))}원`,
              LABELS[label] ?? label,
            ];
          }}
          labelFormatter={(label) => String(label)}
        />
        <Legend
          formatter={(value: string) => LABELS[value] ?? value}
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
        />
        <Area
          type="monotone"
          dataKey="rocket"
          stackId="sales"
          stroke="#7c3aed"
          strokeWidth={2.5}
          fill="url(#salesChannelRocket)"
          name="rocket"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="others"
          stackId="sales"
          stroke="#0ea5e9"
          strokeWidth={2.5}
          fill="url(#salesChannelOthers)"
          name="others"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
