'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { DailyCost } from '@/lib/agent-types';
import { formatCost } from '@/lib/agent-utils';

interface Props {
  data: DailyCost[];
}

export default function CostTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <h3 className="text-sm font-medium text-gray-700 mb-4">일별 비용 추이</h3>
        <p className="text-sm text-gray-400 text-center py-8">해당 기간에 실행 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      <h3 className="text-sm font-medium text-gray-700 mb-4">일별 비용 추이</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => {
              const parts = d.split('-');
              return `${parts[1]}/${parts[2]}`;
            }}
            axisLine={false}
            tickLine={false}
            fontSize={11}
            fill="#6B7280"
          />
          <YAxis
            tickFormatter={(v) => formatCost(v)}
            axisLine={false}
            tickLine={false}
            fontSize={11}
            fill="#6B7280"
          />
          <Tooltip
            formatter={(v) => [formatCost(Number(v)), '비용']}
            labelFormatter={(d) => d}
            contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }}
          />
          <Area type="monotone" dataKey="totalCostCents" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
