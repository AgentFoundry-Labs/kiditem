'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart,
} from 'recharts';
import { FileText, Download, Calendar, TrendingUp, Eye } from 'lucide-react';
import MetricCard from '@/shared/components/ui/MetricCard';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { formatCurrency, formatNumber } from '@/lib/utils';

const dailySalesData = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(2026, 2, 5 + i);
  return {
    date: `${date.getMonth() + 1}/${date.getDate()}`,
    자사몰: Math.floor(Math.random() * 500000) + 100000,
    스마트스토어: Math.floor(Math.random() * 800000) + 200000,
    쿠팡: Math.floor(Math.random() * 700000) + 150000,
    지마켓: Math.floor(Math.random() * 400000) + 80000,
    '11번가': Math.floor(Math.random() * 300000) + 50000,
    기타: Math.floor(Math.random() * 200000) + 50000,
  };
});

const platformPieData = [
  { name: '스마트스토어', value: 2340000, color: '#10B981' },
  { name: '쿠팡', value: 1890000, color: '#F59E0B' },
  { name: '자사몰', value: 1560000, color: '#3B82F6' },
  { name: '지마켓', value: 1120000, color: '#EF4444' },
  { name: '11번가', value: 870000, color: '#8B5CF6' },
  { name: '기타', value: 980000, color: '#6B7280' },
];

const topProducts = [
  { rank: 1, name: '감정잔디인형키우기', qty: 156, revenue: 2340000, growth: 23 },
  { rank: 2, name: 'LCD전자메모보드(8.5)', qty: 89, revenue: 1780000, growth: -5 },
  { rank: 3, name: '문구세트 12종', qty: 67, revenue: 1340000, growth: 12 },
  { rank: 4, name: '콩나물키우기세트', qty: 52, revenue: 780000, growth: 45 },
  { rank: 5, name: '해피원목테트리스', qty: 43, revenue: 645000, growth: -2 },
  { rank: 6, name: '비눗방울 대형', qty: 38, revenue: 570000, growth: 8 },
  { rank: 7, name: '캐치볼(소)', qty: 35, revenue: 350000, growth: -15 },
  { rank: 8, name: 'RC카 무선조종', qty: 28, revenue: 560000, growth: 35 },
  { rank: 9, name: '포켓몬메타몽샤프', qty: 24, revenue: 120000, growth: 67 },
  { rank: 10, name: '마리모키우기', qty: 22, revenue: 330000, growth: 100 },
];

const monthlyReports = [
  { month: '2026년 2월', status: 'completed', generatedAt: '2026-03-01', pages: 12 },
  { month: '2026년 1월', status: 'completed', generatedAt: '2026-02-01', pages: 11 },
  { month: '2025년 12월', status: 'completed', generatedAt: '2026-01-02', pages: 14 },
];

const customTooltipStyle = {
  backgroundColor: '#111318',
  border: '1px solid #1e2028',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '11px',
  color: '#e2e8f0',
};

export default function ReportModule() {
  const [selectedPeriod, setSelectedPeriod] = useState('2weeks');

  const totalRevenue = platformPieData.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-6">
      {/* Period Selector + Quick Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {['1week', '2weeks', '1month'].map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                selectedPeriod === p
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-gray-600 hover:text-gray-400 border border-transparent'
              }`}
            >
              {p === '1week' ? '1주' : p === '2weeks' ? '2주' : '1개월'}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs hover:bg-violet-500/20 transition-colors">
          <Download className="w-3 h-3" />
          보고서 다운로드
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="기간 총 매출" value={formatCurrency(totalRevenue)} color="text-emerald-400" trend={{ value: 12, label: '전기비' }} />
        <MetricCard label="총 주문수" value="487건" color="text-blue-400" trend={{ value: 8, label: '전기비' }} />
        <MetricCard label="객단가" value={formatCurrency(Math.round(totalRevenue / 487))} color="text-violet-400" trend={{ value: 3, label: '전기비' }} />
        <MetricCard label="방문자수" value="12,345" color="text-amber-400" trend={{ value: -2, label: '전기비' }} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Daily Sales Chart */}
        <div className="col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">일별 매출 추이</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailySalesData}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4B5563' }} axisLine={{ stroke: '#1e2028' }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#4B5563' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
              <Tooltip contentStyle={customTooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
              <Area type="monotone" dataKey="스마트스토어" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.15} />
              <Area type="monotone" dataKey="쿠팡" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} />
              <Area type="monotone" dataKey="자사몰" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} />
              <Area type="monotone" dataKey="지마켓" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Platform Pie */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">플랫폼별 비중</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={platformPieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                dataKey="value"
                stroke="none"
              >
                {platformPieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={customTooltipStyle} formatter={(value) => formatCurrency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {platformPieData.map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-[10px] text-gray-500">{p.name}</span>
                </div>
                <span className="text-[10px] text-gray-400">{Math.round(p.value / totalRevenue * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-white mb-4">판매 TOP 10</h3>
        <div className="space-y-2">
          {topProducts.map((p) => (
            <div key={p.rank} className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
              <span className={`text-sm font-bold w-6 text-center ${p.rank <= 3 ? 'text-amber-400' : 'text-gray-600'}`}>
                {p.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 truncate">{p.name}</p>
              </div>
              <span className="text-xs text-gray-500 w-16 text-right">{p.qty}개</span>
              <span className="text-xs text-gray-300 font-medium w-24 text-right">{formatCurrency(p.revenue)}</span>
              <span className={`text-[10px] w-12 text-right ${p.growth > 0 ? 'text-emerald-400' : p.growth < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {p.growth > 0 ? '+' : ''}{p.growth}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Reports */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">월말보고서 아카이브</h3>
        </div>
        <div className="space-y-2">
          {monthlyReports.map((r) => (
            <div key={r.month} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-[#1e2028]">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-violet-400" />
                <div>
                  <p className="text-xs text-gray-300 font-medium">{r.month} 월말보고서</p>
                  <p className="text-[10px] text-gray-600">생성일: {r.generatedAt} | {r.pages}페이지</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge variant="success">완료</StatusBadge>
                <button className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
