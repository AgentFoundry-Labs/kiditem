'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Package, Truck, Download, PieChart, Users } from 'lucide-react';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { Pagination } from '@/components/ui/Pagination';
import { apiClient } from '@/lib/api-client';
import { cn, formatKRW, formatPercent, formatDate, getGradeColor } from '@/lib/utils';

interface OverviewStats {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  totalProfit: number;
  avgMargin: number;
  today?: { orders: number; revenue: number };
  week?: { orders: number; revenue: number };
  month?: { orders: number; revenue: number };
}

interface ProductStat {
  productId: string;
  productName: string;
  grade: string;
  orderCount: number;
  totalRevenue: number;
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

interface DeliveryData {
  totalShipments: number;
  avgDeliveryDays: number;
  courierDistribution: { courier: string; count: number }[];
  daily: DailyStat[];
}

interface Stats {
  overview?: OverviewStats;
  products?: ProductStat[];
  categories?: CategoryStat[];
  delivery?: DeliveryData;
  grades?: GradeStat[];
  pareto?: ParetoData;
  repurchase?: RepurchaseData;
}

const PAGE_SIZE = 20;

export default function Statistics() {
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(1);
  const [pageCustomers, setPageCustomers] = useState(1);
  const { period, setPeriod, periodOptions } = usePeriodSelector({ months: 12, defaultTo: 'prev' });

  const handleTabChange = (key: string) => {
    setTab(key);
    setPage(1);
    setPageCustomers(1);
  };

  const { data = null } = useQuery<Stats>({
    queryKey: ['statistics', tab, period],
    queryFn: async () => {
      const raw = await apiClient.get<any>(`/api/statistics?type=${tab}&period=${period}`);
      return { [tab]: raw } as Stats;
    },
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
      case 'A': return 'text-purple-600';
      case 'B': return 'text-slate-600';
      case 'C': return 'text-orange-600';
      default: return 'text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">통합 통계</h1>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} options={periodOptions} />
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700">
            <Download size={12} /> 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => handleTabChange(t.key)}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', tab === t.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="empty-state">데이터 없음</div>
      ) : (
        <>
          {/* Overview */}
          {tab === 'overview' && data.overview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatBox label="전체 상품" value={data.overview.totalProducts} unit="개" />
                <StatBox label="전체 주문" value={data.overview.totalOrders} unit="건" />
                <StatBox label="총 매출" value={formatKRW(data.overview.totalRevenue)} unit="원" />
                <StatBox label="총 이익" value={formatKRW(data.overview.totalProfit)} unit="원" />
                <StatBox label="평균 마진" value={formatPercent(data.overview.avgMargin * 100)} unit="" />
              </div>
              {(data.overview.today || data.overview.week || data.overview.month) && (
              <div className="grid grid-cols-3 gap-3">
                {data.overview.today && (
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                  <div className="card-label">오늘</div>
                  <div className="text-xl font-bold tabular-nums mt-1">{formatKRW(data.overview.today.revenue)}<span className="text-sm text-slate-400">원</span></div>
                  <div className="text-xs text-slate-400">{data.overview.today.orders}건</div>
                </div>
                )}
                {data.overview.week && (
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                  <div className="card-label">이번 주</div>
                  <div className="text-xl font-bold tabular-nums mt-1">{formatKRW(data.overview.week.revenue)}<span className="text-sm text-slate-400">원</span></div>
                  <div className="text-xs text-slate-400">{data.overview.week.orders}건</div>
                </div>
                )}
                {data.overview.month && (
                <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                  <div className="card-label">이번 달</div>
                  <div className="text-xl font-bold tabular-nums mt-1">{formatKRW(data.overview.month.revenue)}<span className="text-sm text-slate-400">원</span></div>
                  <div className="text-xs text-slate-400">{data.overview.month.orders}건</div>
                </div>
                )}
              </div>
              )}
            </div>
          )}

          {/* Products */}
          {tab === 'products' && data.products && (() => {
            const pagedProducts = data.products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="table-card">
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr>
                      <th>#</th><th>등급</th><th>상품명</th><th className="text-right">주문수</th>
                      <th className="text-right">매출</th>
                      <th className="text-right">순이익</th><th className="text-right">이익률</th>
                    </tr></thead>
                    <tbody>
                      {pagedProducts.map((p, i) => {
                        const rate = p.profitRate * 100;
                        const rowNum = (page - 1) * PAGE_SIZE + i + 1;
                        return (
                        <tr key={p.productId}>
                          <td className="text-slate-400 tabular-nums">{rowNum}</td>
                          <td><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', getGradeColor(p.grade))}>{p.grade}</span></td>
                          <td className="font-medium text-slate-900 max-w-[200px] truncate">{p.productName}</td>
                          <td className="text-right tabular-nums">{p.orderCount}</td>
                          <td className="text-right tabular-nums">{formatKRW(p.totalRevenue)}원</td>
                          <td className={cn('text-right tabular-nums', p.netProfit < 0 ? 'text-red-600' : 'text-green-600')}>{formatKRW(p.netProfit)}원</td>
                          <td className={cn('text-right tabular-nums font-semibold', rate < 0 ? 'text-red-600' : rate <= 3 ? 'text-orange-500' : 'text-green-600')}>{formatPercent(rate)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} limit={PAGE_SIZE} total={data.products.length} onPageChange={setPage} />
              </div>
            );
          })()}

          {/* Categories */}
          {tab === 'categories' && data.categories && (() => {
            const pagedCategories = data.categories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="table-card">
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr><th>카테고리</th><th className="text-right">상품수</th><th className="text-right">매출</th><th className="text-right">순이익</th></tr></thead>
                    <tbody>
                      {pagedCategories.map((c, i) => (
                        <tr key={i}>
                          <td className="font-medium text-slate-900">{c.name}</td>
                          <td className="text-right tabular-nums">{c.count}개</td>
                          <td className="text-right tabular-nums">{formatKRW(c.revenue)}원</td>
                          <td className={cn('text-right tabular-nums', c.profit < 0 ? 'text-red-600' : 'text-green-600')}>{formatKRW(c.profit)}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={page} limit={PAGE_SIZE} total={data.categories.length} onPageChange={setPage} />
              </div>
            );
          })()}

          {/* Delivery / Daily */}
          {tab === 'delivery' && data.delivery && (() => {
            const dailySorted = [...(data.delivery.daily ?? [])].reverse();
            const pagedDaily = dailySorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="space-y-4">
                {data.delivery.daily && (
                <div className="table-card">
                  <div className="overflow-x-auto">
                    <table>
                      <thead><tr><th>날짜</th><th className="text-right">주문수</th><th className="text-right">매출</th><th className="text-right">수량</th></tr></thead>
                      <tbody>
                        {pagedDaily.map((d) => (
                          <tr key={d.date}>
                            <td className="font-mono text-slate-600">{d.date}</td>
                            <td className="text-right tabular-nums">{d.orders}건</td>
                            <td className="text-right tabular-nums">{formatKRW(d.revenue)}원</td>
                            <td className="text-right tabular-nums">{d.qty}개</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} limit={PAGE_SIZE} total={dailySorted.length} onPageChange={setPage} />
                </div>
                )}
              </div>
            );
          })()}

          {/* Grades */}
          {tab === 'grades' && data.grades && (
            <div className="grid grid-cols-3 gap-3">
              {[...data.grades].sort((a, b) => a.grade.localeCompare(b.grade)).map((g) => (
                <div key={g.grade} className="bg-white rounded-xl border border-slate-200 px-4 py-4">
                  <div className={cn('text-2xl font-bold', getGradeTextColor(g.grade))}>{g.grade}등급</div>
                  <div className="text-xs text-slate-400 mt-1">{g.count}개 상품</div>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">매출</span><span className="font-semibold tabular-nums">{formatKRW(g.revenue)}원</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">순이익</span><span className={cn('font-semibold tabular-nums', g.profit < 0 ? 'text-red-600' : 'text-green-600')}>{formatKRW(g.profit)}원</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">광고비</span><span className="font-semibold tabular-nums text-amber-600">{formatKRW(g.adCost)}원</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABC Pareto */}
          {tab === 'pareto' && data.pareto && (() => {
            const pagedPareto = data.pareto.data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatBox label="총 매출" value={formatKRW(data.pareto.totalRevenue)} unit="원" />
                  <StatBox label="A등급 (70%)" value={data.pareto.gradeDistribution.A} unit="개" />
                  <StatBox label="B등급 (20%)" value={data.pareto.gradeDistribution.B} unit="개" />
                  <StatBox label="등급 불일치" value={data.pareto.mismatchCount} unit="개" />
                </div>

                {/* 파레토 테이블 */}
                <div className="table-card">
                  <div className="table-scroll">
                    <table>
                      <thead className="sticky top-0"><tr>
                        <th>#</th><th>상품명</th><th>현재등급</th><th>추천등급</th>
                        <th className="text-right">매출</th><th className="text-right">매출비율</th><th className="text-right">누적비율</th>
                      </tr></thead>
                      <tbody>
                        {pagedPareto.map((p) => (
                          <tr key={p.id} className={!p.gradeMatch ? 'bg-yellow-50/50' : ''}>
                            <td className="text-slate-400 tabular-nums">{p.rank}</td>
                            <td className="font-medium text-slate-900 max-w-[200px] truncate">{p.name}</td>
                            <td><span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', getGradeColor(p.currentGrade))}>{p.currentGrade}</span></td>
                            <td>
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', getGradeColor(p.suggestedGrade))}>
                                {p.suggestedGrade}
                              </span>
                              {!p.gradeMatch && <span className="ml-1 text-[9px] text-red-500">불일치</span>}
                            </td>
                            <td className="text-right tabular-nums">{formatKRW(p.revenue)}원</td>
                            <td className="text-right tabular-nums text-slate-500">{p.revenuePercent}%</td>
                            <td className={cn('text-right tabular-nums font-medium', p.cumulativePercent <= 70 ? 'text-green-600' : p.cumulativePercent <= 90 ? 'text-yellow-600' : 'text-red-600')}>{p.cumulativePercent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} limit={PAGE_SIZE} total={data.pareto.data.length} onPageChange={setPage} />
                </div>
              </div>
            );
          })()}

          {/* Repurchase */}
          {tab === 'repurchase' && data.repurchase && (() => {
            const repeatProducts = data.repurchase.repeatProducts ?? [];
            const repeatCustomers = data.repurchase.repeatCustomers ?? [];
            const pagedProducts = repeatProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            const pagedCustomers = repeatCustomers.slice((pageCustomers - 1) * PAGE_SIZE, pageCustomers * PAGE_SIZE);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="전체 고객수" value={data.repurchase.totalCustomers} unit="명" />
                  <StatBox label="재구매 고객" value={data.repurchase.repeatCount} unit="명" />
                  <StatBox label="재구매율" value={formatPercent(data.repurchase.repurchaseRate * 100)} unit="" />
                </div>

                {/* 반복 주문 상품 */}
                {repeatProducts.length > 0 && (
                <div className="table-card">
                  <div className="px-4 py-3 border-b border-slate-200">
                    <h3 className="section-title">재구매 상품</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table>
                      <thead><tr>
                        <th>#</th><th>상품명</th><th>카테고리</th><th className="text-right">주문횟수</th>
                      </tr></thead>
                      <tbody>
                        {pagedProducts.map((p, i) => (
                          <tr key={p.productId}>
                            <td className="text-slate-400 tabular-nums">{(page - 1) * PAGE_SIZE + i + 1}</td>
                            <td className="font-medium text-slate-900 max-w-[200px] truncate">{p.productName}</td>
                            <td className="text-slate-500 text-xs">{p.category}</td>
                            <td className="text-right tabular-nums font-semibold text-purple-600">{p.orderCount}회</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} limit={PAGE_SIZE} total={repeatProducts.length} onPageChange={setPage} />
                </div>
                )}

                {/* 재구매 고객 */}
                {repeatCustomers.length > 0 && (
                  <div className="table-card">
                    <div className="px-4 py-3 border-b border-slate-200">
                      <h3 className="section-title">재구매 고객</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table>
                        <thead><tr>
                          <th>고객명</th><th className="text-right">주문횟수</th><th className="text-right">총 주문금액</th><th>마지막 주문</th>
                        </tr></thead>
                        <tbody>
                          {pagedCustomers.map((c) => (
                            <tr key={c.name}>
                              <td className="font-medium text-slate-900">{c.name}</td>
                              <td className="text-right tabular-nums font-semibold text-purple-600">{c.count}회</td>
                              <td className="text-right tabular-nums">{formatKRW(c.totalAmount)}원</td>
                              <td className="text-slate-500 text-xs font-mono">{c.lastOrder ? formatDate(c.lastOrder) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={pageCustomers} limit={PAGE_SIZE} total={repeatCustomers.length} onPageChange={setPageCustomers} />
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, unit }: { label: string; value: number | string; unit: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="card-label">{label}</div>
      <div className="text-lg font-bold tabular-nums text-slate-900 mt-1">{value}<span className="text-sm text-slate-400 ml-0.5">{unit}</span></div>
    </div>
  );
}
