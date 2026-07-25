'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatKRW, formatNumber } from '@/lib/utils';

export interface RocketDailyChartPoint {
  date: string;
  revenue: number;
  poCount: number;
  itemQty: number;
}

const CHART_HEIGHT = 300;
const CHART_INITIAL_DIMENSION = { width: 800, height: CHART_HEIGHT };

const LABELS: Record<string, string> = {
  revenue: '발주금액',
  itemQty: '발주수량',
};

export function RocketDailySalesChart({ data }: { data: RocketDailyChartPoint[] }) {
  return (
    <ResponsiveContainer
      width="100%"
      height={CHART_HEIGHT}
      initialDimension={CHART_INITIAL_DIMENSION}
    >
      <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
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
          yAxisId="revenue"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(value: number) => `${Math.round(value / 10_000)}만`}
          domain={[0, 'auto']}
        />
        <YAxis
          yAxisId="quantity"
          orientation="right"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#0ea5e9' }}
          tickFormatter={(value: number) => formatNumber(value)}
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
            const key = String(name ?? '');
            const formatted = key === 'revenue'
              ? `${formatKRW(Number(value ?? 0))}원`
              : `${formatNumber(Number(value ?? 0))}개`;
            return [formatted, LABELS[key] ?? key];
          }}
          labelFormatter={(label) => `발주일 ${String(label)}`}
        />
        <Legend
          formatter={(value: string) => LABELS[value] ?? value}
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
        />
        <Bar
          yAxisId="revenue"
          dataKey="revenue"
          name="revenue"
          fill="#7c3aed"
          fillOpacity={0.78}
          radius={[5, 5, 0, 0]}
          maxBarSize={28}
        />
        <Line
          yAxisId="quantity"
          type="monotone"
          dataKey="itemQty"
          name="itemQty"
          stroke="#0ea5e9"
          strokeWidth={2.5}
          dot={{ r: 2.5, fill: '#fff', strokeWidth: 2 }}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
