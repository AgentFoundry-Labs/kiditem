'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Package, Truck, Download, PieChart, Users } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW, formatNumber, getGradeColor } from '@/lib/utils';

interface OverviewStats {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  totalQuantity: number;
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
  month: { orders: number; revenue: number };
}

interface ProductStat {
  id: string;
  name: string;
  grade: string;
  orderCount: number;
  totalRevenue: number;
  totalQuantity: number;
  netProfit: number;
  profitRate: number;
}

interface CategoryStat {
  name: string;
  count: number;
  revenue: number;
  profit: number;
}

interface DailyStat {
  date: string;
  orders: number;
  revenue: number;
  qty: number;
}

interface GradeStat {
  grade: string;
  count: number;
  revenue: number;
  profit: number;
  adCost: number;
}

interface ParetoItem {
  id: string;
  rank: number;
  name: string;
  currentGrade: string;
  suggestedGrade: string;
  gradeMatch: boolean;
  revenue: number;
  revenuePercent: number;
  cumulativePercent: number;
}

interface ParetoData {
  totalRevenue: number;
  gradeDistribution: { A: number; B: number; C?: number };
  mismatchCount: number;
  data: ParetoItem[];
}

interface RepurchaseData {
  totalCustomers: number;
  repeatCount: number;
  repurchaseRate: number;
  repeatProducts?: { productId: string; productName: string; category: string; orderCount: number }[];
  repeatCustomers?: { name: string; count: number; totalAmount: number; lastOrder: string | null }[];
}

interface Stats {
  overview?: OverviewStats;
  products?: ProductStat[];
  categories?: CategoryStat[];
  daily?: DailyStat[];
  grades?: GradeStat[];
  pareto?: ParetoData;
  repurchase?: RepurchaseData;
}

export default function Statistics() {
  const [tab, setTab] = useState('overview');

  const { data = null } = useQuery<Stats>({
    queryKey: ['statistics', tab],
    queryFn: () => apiClient.get<Stats>(`/api/statistics?type=${tab}`),
  });

  const tabs = [
    { key: 'overview', label: '전체 개요', icon: TrendingUp },
    { key: 'products', label: '제품별', icon: Package },
    { key: 'categories', label: '카테고리별', icon: BarChart3 },
    { key: 'delivery', label: '배송/일별', icon: Truck },
    { key: 'grades', label: '등급별', icon: BarChart3 },
    { key: 'pareto', label: 'ABC 파레토', icon: PieChart },
    { key: 'repurchase', label: '재구매율', icon: Users },
  ];

  const getGradeTextColor = (grade: string): string => {
    switch (grade) {
      case 'A': return 'text-blue-600';
      case 'B': return 'text-gray-600';
      case 'C': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Statistics</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">통합 통계 관리</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700">
          <Download size={12} /> 엑셀 다운로드
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="text-center py-12 text-gray-400 text-sm">데이터 없음</div>
      ) : (
        <>
          {/* Overview */}
          {tab === 'overview' && data.overview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatBox label="전체 상품" value={data.overview.totalProducts} unit="개" />
                <StatBox label="전체 주문" value={data.overview.totalOrders} unit="건" />
                <StatBox label="총 매출" value={formatKRW(data.overview.totalRevenue)} unit="원" />
                <StatBox label="총 수량" value={formatNumber(data.overview.totalQuantity)} unit="개" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="agent-card"><div className="px-4 py-3">
                  <div className="text-[10px] text-gray-500 font-mono uppercase">Today</div>
                  <div className="text-xl font-bold tabular-nums">{formatKRW(data.overview.today.revenue)}<span className="text-sm text-gray-400">원</span></div>
                  <div className="text-xs text-gray-400">{data.overview.today.orders}건</div>
                </div></div>
                <div className="agent-card"><div className="px-4 py-3">
                  <div className="text-[10px] text-gray-500 font-mono uppercase">This Week</div>
                  <div className="text-xl font-bold tabular-nums">{formatKRW(data.overview.week.revenue)}<span className="text-sm text-gray-400">원</span></div>
                  <div className="text-xs text-gray-400">{data.overview.week.orders}건</div>
                </div></div>
                <div className="agent-card"><div className="px-4 py-3">
                  <div className="text-[10px] text-gray-500 font-mono uppercase">This Month</div>
                  <div className="text-xl font-bold tabular-nums">{formatKRW(data.overview.month.revenue)}<span className="text-sm text-gray-400">원</span></div>
                  <div className="text-xs text-gray-400">{data.overview.month.orders}건</div>
                </div></div>
              </div>
            </div>
          )}

          {/* Products */}
          {tab === 'products' && data.products && (
            <div className="agent-card overflow-hidden">
              <div className="overflow-x-auto">
                <table>
                  <thead><tr>
                    <th>#</th><th>등급</th><th>상품명</th><th className="text-right">주문수</th>
                    <th className="text-right">매출</th><th className="text-right">수량</th>
                    <th className="text-right">순이익</th><th className="text-right">이익률</th>
                  </tr></thead>
                  <tbody>
                    {data.products.slice(0, 50).map((p, i) => (
                      <tr key={p.id}>
                        <td className="text-gray-400 tabular-nums">{i + 1}</td>
                        <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(p.grade)}`}>{p.grade}</span></td>
                        <td className="font-medium text-gray-900 max-w-[200px] truncate">{p.name}</td>
                        <td className="text-right tabular-nums">{p.orderCount}</td>
                        <td className="text-right tabular-nums">{formatKRW(p.totalRevenue)}원</td>
                        <td className="text-right tabular-nums">{p.totalQuantity}</td>
                        <td className={`text-right tabular-nums ${p.netProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatKRW(p.netProfit)}원</td>
                        <td className={`text-right tabular-nums font-semibold ${p.profitRate < 0 ? 'text-red-600' : p.profitRate <= 3 ? 'text-orange-500' : 'text-green-600'}`}>{p.profitRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Categories */}
          {tab === 'categories' && data.categories && (
            <div className="agent-card overflow-hidden">
              <div className="overflow-x-auto">
                <table>
                  <thead><tr><th>카테고리</th><th className="text-right">상품수</th><th className="text-right">매출</th><th className="text-right">순이익</th></tr></thead>
                  <tbody>
                    {data.categories.map((c, i) => (
                      <tr key={i}>
                        <td className="font-medium text-gray-900">{c.name}</td>
                        <td className="text-right tabular-nums">{c.count}개</td>
                        <td className="text-right tabular-nums">{formatKRW(c.revenue)}원</td>
                        <td className={`text-right tabular-nums ${c.profit < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatKRW(c.profit)}원</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Delivery / Daily */}
          {tab === 'delivery' && data.daily && (
            <div className="space-y-4">
              <div className="agent-card">
                <div className="agent-card-header"><h3>Daily Orders</h3></div>
                <div className="p-4 text-center text-gray-400 text-sm">
                  차트 데이터가 연결되면 표시됩니다.
                </div>
              </div>
              <div className="agent-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr><th>날짜</th><th className="text-right">주문수</th><th className="text-right">매출</th><th className="text-right">수량</th></tr></thead>
                    <tbody>
                      {data.daily.slice(-30).reverse().map((d) => (
                        <tr key={d.date}>
                          <td className="font-mono text-gray-600">{d.date}</td>
                          <td className="text-right tabular-nums">{d.orders}건</td>
                          <td className="text-right tabular-nums">{formatKRW(d.revenue)}원</td>
                          <td className="text-right tabular-nums">{d.qty}개</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Grades */}
          {tab === 'grades' && data.grades && (
            <div className="grid grid-cols-3 gap-3">
              {[...data.grades].sort((a, b) => a.grade.localeCompare(b.grade)).map((g) => (
                <div key={g.grade} className="agent-card">
                  <div className="px-4 py-4">
                    <div className={`text-2xl font-bold ${getGradeTextColor(g.grade)}`}>{g.grade}등급</div>
                    <div className="text-xs text-gray-400 mt-1">{g.count}개 상품</div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">매출</span><span className="font-semibold tabular-nums">{formatKRW(g.revenue)}원</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">순이익</span><span className={`font-semibold tabular-nums ${g.profit < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatKRW(g.profit)}원</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">광고비</span><span className="font-semibold tabular-nums text-amber-600">{formatKRW(g.adCost)}원</span></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABC Pareto */}
          {tab === 'pareto' && data.pareto && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatBox label="총 매출" value={formatKRW(data.pareto.totalRevenue)} unit="원" />
                <StatBox label="A등급 (70%)" value={data.pareto.gradeDistribution.A} unit="개" />
                <StatBox label="B등급 (20%)" value={data.pareto.gradeDistribution.B} unit="개" />
                <StatBox label="등급 불일치" value={data.pareto.mismatchCount} unit="개" />
              </div>

              {/* 파레토 차트 placeholder */}
              <div className="agent-card">
                <div className="agent-card-header"><h3>Pareto Chart (ABC Analysis)</h3></div>
                <div className="p-4 text-center text-gray-400 text-sm">
                  차트 데이터가 연결되면 표시됩니다.
                </div>
              </div>

              {/* 파레토 테이블 */}
              <div className="agent-card overflow-hidden">
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table>
                    <thead className="sticky top-0 bg-slate-50"><tr>
                      <th>#</th><th>상품명</th><th>현재등급</th><th>추천등급</th>
                      <th className="text-right">매출</th><th className="text-right">매출비율</th><th className="text-right">누적비율</th>
                    </tr></thead>
                    <tbody>
                      {data.pareto.data.map((p) => (
                        <tr key={p.id} className={!p.gradeMatch ? 'bg-yellow-50/50' : ''}>
                          <td className="text-gray-400 tabular-nums">{p.rank}</td>
                          <td className="font-medium text-gray-900 max-w-[200px] truncate">{p.name}</td>
                          <td><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(p.currentGrade)}`}>{p.currentGrade}</span></td>
                          <td>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getGradeColor(p.suggestedGrade)}`}>
                              {p.suggestedGrade}
                            </span>
                            {!p.gradeMatch && <span className="ml-1 text-[9px] text-red-500 font-mono">DIFF</span>}
                          </td>
                          <td className="text-right tabular-nums">{formatKRW(p.revenue)}원</td>
                          <td className="text-right tabular-nums text-gray-500">{p.revenuePercent}%</td>
                          <td className={`text-right tabular-nums font-medium ${p.cumulativePercent <= 70 ? 'text-green-600' : p.cumulativePercent <= 90 ? 'text-yellow-600' : 'text-red-600'}`}>{p.cumulativePercent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Repurchase */}
          {tab === 'repurchase' && data.repurchase && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="전체 고객수" value={data.repurchase.totalCustomers} unit="명" />
                <StatBox label="재구매 고객" value={data.repurchase.repeatCount} unit="명" />
                <StatBox label="재구매율" value={`${data.repurchase.repurchaseRate}%`} unit="" />
              </div>

              {/* 반복 주문 상품 */}
              <div className="agent-card overflow-hidden">
                <div className="agent-card-header"><h3>Repeat Order Products</h3></div>
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <table>
                    <thead className="sticky top-0 bg-slate-50"><tr>
                      <th>#</th><th>상품명</th><th>카테고리</th><th className="text-right">주문횟수</th>
                    </tr></thead>
                    <tbody>
                      {data.repurchase.repeatProducts?.map((p, i) => (
                        <tr key={p.productId}>
                          <td className="text-gray-400 tabular-nums">{i + 1}</td>
                          <td className="font-medium text-gray-900 max-w-[200px] truncate">{p.productName}</td>
                          <td className="text-gray-500 text-xs">{p.category}</td>
                          <td className="text-right tabular-nums font-semibold text-blue-600">{p.orderCount}회</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 재구매 고객 */}
              {(data.repurchase.repeatCustomers?.length ?? 0) > 0 && (
                <div className="agent-card overflow-hidden">
                  <div className="agent-card-header"><h3>Repeat Customers</h3></div>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table>
                      <thead className="sticky top-0 bg-slate-50"><tr>
                        <th>고객명</th><th className="text-right">주문횟수</th><th className="text-right">총 주문금액</th><th>마지막 주문</th>
                      </tr></thead>
                      <tbody>
                        {data.repurchase.repeatCustomers!.map((c) => (
                          <tr key={c.name}>
                            <td className="font-medium text-gray-900">{c.name}</td>
                            <td className="text-right tabular-nums font-semibold text-blue-600">{c.count}회</td>
                            <td className="text-right tabular-nums">{formatKRW(c.totalAmount)}원</td>
                            <td className="text-gray-500 text-xs font-mono">{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString('ko-KR') : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, unit }: { label: string; value: number | string; unit: string }) {
  return (
    <div className="agent-card"><div className="px-4 py-3">
      <div className="text-[10px] text-gray-500 font-mono uppercase">{label}</div>
      <div className="text-lg font-bold tabular-nums text-gray-900">{value}<span className="text-sm text-gray-400 ml-0.5">{unit}</span></div>
    </div></div>
  );
}
