'use client'

import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  ArrowDownCircle, 
  AlertTriangle, 
  AlertOctagon, 
  RefreshCcw,
  Bell
} from 'lucide-react';
import { formatKRW, formatPercent, getGradeColor, getProfitColor, cn, timeAgo } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

interface DashboardData {
  summary: {
    todayRevenue: number;
    todayOrders: number;
    monthlyRevenue: number;
    monthlyProfit: number;
    adRate: number;
    totalProducts: number;
  };
  gradeCount: { A: number; B: number; C: number };
  alerts: Array<{ id: string; type: string; severity: string; title: string; message: string; createdAt: string }>;
  warnings: {
    minusProducts: number;
    lowProfitProducts: number;
    highAdProducts: number;
    needReorder: number;
  };
  topProducts: Array<{
    id: string;
    name: string;
    company: string;
    grade: string;
    revenue: number;
    netProfit: number;
    profitRate: number;
  }>;
  monthlyTrend: Array<{
    period: string;
    revenue: number;
    profit: number;
    adCost: number;
  }>;
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch(`${API_BASE}/api/dashboard`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          console.error('Failed to fetch dashboard data');
        }
      } catch (err) {
        console.error('Error fetching dashboard', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">대시보드 데이터를 불러오는데 실패했습니다.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">운영 대시보드</h1>
        <p className="text-gray-500 mt-1">실시간 비즈니스 현황을 확인하세요.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">오늘 매출</h3>
            <DollarSign className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">₩{formatKRW(data.summary.todayRevenue)}</p>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">오늘 주문</h3>
            <ShoppingCart className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatKRW(data.summary.todayOrders)}건</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">월 매출</h3>
            <TrendingUp className="w-5 h-5 text-violet-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">₩{formatKRW(data.summary.monthlyRevenue)}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-500">월 순이익</h3>
            <DollarSign className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">₩{formatKRW(data.summary.monthlyProfit)}</p>
        </div>
      </div>

      {/* Warning Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-red-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-full text-red-600">
            <ArrowDownCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">마이너스 상품</p>
            <p className="text-xl font-bold text-gray-900">{data.warnings.minusProducts}개</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-orange-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-3 bg-orange-100 rounded-full text-orange-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">저수익 상품</p>
            <p className="text-xl font-bold text-gray-900">{data.warnings.lowProfitProducts}개</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-yellow-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-3 bg-yellow-100 rounded-full text-yellow-600">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">광고비 과다</p>
            <p className="text-xl font-bold text-gray-900">{data.warnings.highAdProducts}개</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-full text-blue-600">
            <RefreshCcw className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">재고 부족</p>
            <p className="text-xl font-bold text-gray-900">{data.warnings.needReorder}개</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 lg:col-span-2">
          <h3 className="text-lg font-bold text-gray-900 mb-4">월별 추이</h3>
           <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
               <BarChart data={data.monthlyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                <YAxis 
                  yAxisId="left" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#6B7280' }} 
                  tickFormatter={(value) => `₩${(value / 10000).toFixed(0)}만`} 
                />
                <Tooltip 
                  formatter={(value: any) => `₩${formatKRW(value as number)}`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar yAxisId="left" dataKey="revenue" name="매출" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="profit" name="순이익" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alerts List */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">최근 알림</h3>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-4 overflow-y-auto flex-1 max-h-[300px] pr-2">
            {data.alerts.map((alert) => (
              <div key={alert.id} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                <div className="flex items-start justify-between">
                  <h4 className={cn(
                    "font-medium text-sm",
                    alert.severity === 'high' ? 'text-red-600' : 'text-gray-900'
                  )}>
                    {alert.title}
                  </h4>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                    {timeAgo(alert.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{alert.message}</p>
              </div>
            ))}
            {data.alerts.length === 0 && (
              <div className="text-sm text-gray-500 py-4 text-center">알림이 없습니다.</div>
            )}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900">Top 10 상품</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 bg-gray-50 uppercase border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-medium">등급</th>
                <th className="px-6 py-3 font-medium">상품명</th>
                <th className="px-6 py-3 font-medium text-right">매출</th>
                <th className="px-6 py-3 font-medium text-right">순이익</th>
                <th className="px-6 py-3 font-medium text-right">수익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.topProducts.map((product) => (
                <tr key={product.id} className="bg-white hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={cn("px-2.5 py-1 text-xs font-semibold rounded-full", getGradeColor(product.grade))}>
                      {product.grade}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.company}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900">
                    ₩{formatKRW(product.revenue)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-gray-900">
                    ₩{formatKRW(product.netProfit)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                    <span className={getProfitColor(product.profitRate)}>
                      {formatPercent(product.profitRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
