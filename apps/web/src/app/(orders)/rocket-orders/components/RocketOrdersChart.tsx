'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatKRW, formatNumber } from '@/lib/utils';

export interface RocketChartPoint {
  date: string;
  label: string;
  count: number;
  qty: number;
  amount: number;
}

export function RocketOrdersChart({ data }: { data: RocketChartPoint[] }) {
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  const totalQty = data.reduce((s, d) => s + d.qty, 0);
  const totalAmount = data.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] text-slate-400">총 발주건수</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">{formatNumber(totalCount)}건</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">총 수량</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">{formatNumber(totalQty)}개</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">총 매출 (발주금액)</div>
          <div className="text-lg font-bold tabular-nums text-purple-700">{formatKRW(totalAmount)}원</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300} initialDimension={{ width: 800, height: 300 }}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#94a3b8' }} minTickGap={8} />
          <YAxis
            yAxisId="cnt"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8' }}
            allowDecimals={false}
            domain={[0, 'auto']}
          />
          <YAxis
            yAxisId="amt"
            orientation="right"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#94a3b8' }}
            tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`}
            domain={[0, 'auto']}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#0f172a' }}
            labelFormatter={(label) => `입고예정 ${String(label ?? '')}`}
            formatter={(value, name) => {
              const metric = String(name ?? '');
              const numericValue = Number(value ?? 0);
              if (metric === 'count') return [`${formatNumber(numericValue)}건`, '발주건수'];
              if (metric === 'amount') return [`${formatKRW(numericValue)}원`, '매출'];
              return [String(value ?? ''), metric];
            }}
          />
          <Bar yAxisId="cnt" dataKey="count" name="count" fill="#a78bfa" radius={[5, 5, 0, 0]} maxBarSize={40} />
          <Line yAxisId="amt" type="monotone" dataKey="amount" name="amount" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
