'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Legend,
} from 'recharts';
import { formatKRW } from '@/lib/utils';

export interface ChannelSalesChartPoint {
  date: string;
  rocket: number;
  others: number;
}

const CHART_HEIGHT = 260;
const CHART_INITIAL_DIMENSION = { width: 600, height: CHART_HEIGHT };

const LABELS: Record<string, string> = {
  rocket: '쿠팡 로켓',
  others: '쿠팡윙·기타몰',
};

export function DashboardChannelSalesChart({ data }: { data: ChannelSalesChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT} initialDimension={CHART_INITIAL_DIMENSION}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gChannelRocket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gChannelOthers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="date"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(v: string) => (typeof v === 'string' ? v.slice(5) : v)}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94a3b8' }}
          tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
          domain={[0, 'auto']}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }}
          formatter={(value: any, name: any) => [formatKRW(Number(value)), LABELS[name as string] ?? name]}
        />
        <Legend
          formatter={(value: any) => LABELS[value as string] ?? value}
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
        />
        <Area type="monotone" dataKey="rocket" stackId="1" stroke="#7c3aed" strokeWidth={2} fill="url(#gChannelRocket)" name="rocket" dot={false} />
        <Area type="monotone" dataKey="others" stackId="1" stroke="#0ea5e9" strokeWidth={2} fill="url(#gChannelOthers)" name="others" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
