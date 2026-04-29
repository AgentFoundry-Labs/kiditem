'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  Package,
  PieChart,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { z } from 'zod';
import {
  StatisticsCategoryRowSchema,
  StatisticsDeliveryResponseSchema,
  StatisticsGradeRowSchema,
  StatisticsOverviewSchema,
  StatisticsParetoResponseSchema,
  StatisticsProductRowSchema,
  StatisticsRepurchaseResponseSchema,
} from '@kiditem/shared/statistics';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import PeriodSelector from '@/components/ui/PeriodSelector';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDate, formatKRW, formatPercent, getGradeColor } from '@/lib/utils';
import type {
  StatisticsCategoryRow,
  StatisticsDeliveryResponse,
  StatisticsGradeRow,
  StatisticsOverview,
  StatisticsParetoResponse,
  StatisticsProductRow,
  StatisticsRepurchaseResponse,
} from '@kiditem/shared/statistics';

const ProductRowsSchema = z.array(StatisticsProductRowSchema);
const CategoryRowsSchema = z.array(StatisticsCategoryRowSchema);
const GradeRowsSchema = z.array(StatisticsGradeRowSchema);

type StatisticsTab =
  | 'overview'
  | 'products'
  | 'categories'
  | 'delivery'
  | 'grades'
  | 'pareto'
  | 'repurchase';

type StatisticsData = {
  overview?: StatisticsOverview;
  products?: StatisticsProductRow[];
  categories?: StatisticsCategoryRow[];
  delivery?: StatisticsDeliveryResponse;
  grades?: StatisticsGradeRow[];
  pareto?: StatisticsParetoResponse;
  repurchase?: StatisticsRepurchaseResponse;
};

const PAGE_SIZE = 20;

const tabs: Array<{
  key: StatisticsTab;
  label: string;
  icon: typeof TrendingUp;
}> = [
  { key: 'overview', label: '전체 개요', icon: TrendingUp },
  { key: 'products', label: '제품별', icon: Package },
  { key: 'categories', label: '카테고리별', icon: BarChart3 },
  { key: 'delivery', label: '배송/일별', icon: Truck },
  { key: 'grades', label: '등급별', icon: BarChart3 },
  { key: 'pareto', label: 'ABC 파레토', icon: PieChart },
  { key: 'repurchase', label: '재구매율', icon: Users },
];

async function fetchStatisticsTab(
  tab: StatisticsTab,
  period: string,
): Promise<StatisticsData> {
  switch (tab) {
    case 'overview':
      return {
        overview: await apiClient.getParsed(
          `/api/statistics?type=overview&period=${period}`,
          StatisticsOverviewSchema,
        ),
      };
    case 'products':
      return {
        products: await apiClient.getParsed(
          `/api/statistics?type=products&period=${period}`,
          ProductRowsSchema,
        ),
      };
    case 'categories':
      return {
        categories: await apiClient.getParsed(
          `/api/statistics?type=categories&period=${period}`,
          CategoryRowsSchema,
        ),
      };
    case 'delivery':
      return {
        delivery: await apiClient.getParsed(
          `/api/statistics?type=delivery&period=${period}`,
          StatisticsDeliveryResponseSchema,
        ),
      };
    case 'grades':
      return {
        grades: await apiClient.getParsed(
          `/api/statistics?type=grades&period=${period}`,
          GradeRowsSchema,
        ),
      };
    case 'pareto':
      return {
        pareto: await apiClient.getParsed(
          `/api/statistics?type=pareto&period=${period}`,
          StatisticsParetoResponseSchema,
        ),
      };
    case 'repurchase':
      return {
        repurchase: await apiClient.getParsed(
          `/api/statistics?type=repurchase&period=${period}`,
          StatisticsRepurchaseResponseSchema,
        ),
      };
    default: {
      const unreachable: never = tab;
      throw new Error(`Unknown statistics tab: ${unreachable}`);
    }
  }
}

function isTabEmpty(tab: StatisticsTab, data: StatisticsData): boolean {
  switch (tab) {
    case 'products':
      return (data.products?.length ?? 0) === 0;
    case 'categories':
      return (data.categories?.length ?? 0) === 0;
    case 'grades':
      return (data.grades?.length ?? 0) === 0;
    case 'pareto':
      return (data.pareto?.data.length ?? 0) === 0;
    case 'repurchase': {
      const repurchase = data.repurchase;
      if (!repurchase) return true;
      return (
        repurchase.totalCustomers === 0
        && repurchase.repeatProducts.length === 0
        && repurchase.repeatCustomers.length === 0
      );
    }
    default:
      return false;
  }
}

function getGradeTextColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-[var(--primary)]';
    case 'B':
      return 'text-[var(--text-secondary)]';
    case 'C':
      return 'text-amber-600';
    default:
      return 'text-[var(--text-secondary)]';
  }
}

export default function Statistics() {
  const [tab, setTab] = useState<StatisticsTab>('overview');
  const [page, setPage] = useState(1);
  const [pageCustomers, setPageCustomers] = useState(1);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get('period');

  const { period, setPeriod: setPeriodRaw, periodOptions } = usePeriodSelector({
    months: 12,
    defaultTo: 'prev',
    initial: urlPeriod ?? undefined,
  });

  const setPeriod = (nextPeriod: string) => {
    setPeriodRaw(nextPeriod);
    setPage(1);
    setPageCustomers(1);
    const params = new URLSearchParams(searchParams);
    params.set('period', nextPeriod);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleTabChange = (nextTab: StatisticsTab) => {
    setTab(nextTab);
    setPage(1);
    setPageCustomers(1);
  };

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.salesAnalysis.statistics(tab, period),
    queryFn: () => fetchStatisticsTab(tab, period),
  });

  const error = friendlyError(queryError);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">통합 통계</h1>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} options={periodOptions} />
          <button
            className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
            type="button"
          >
            <Download size={12} /> 엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => handleTabChange(tabItem.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              tab === tabItem.key
                ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]',
            )}
            type="button"
          >
            <tabItem.icon size={13} /> {tabItem.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSkeleton variant="table" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data ? (
        <EmptyState message="해당 기간 데이터가 없습니다." />
      ) : isTabEmpty(tab, data) ? (
        <EmptyState message="해당 기간 데이터가 없습니다." />
      ) : (
        <>
          {tab === 'overview' && data.overview && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatBox label="전체 상품" value={data.overview.totalProducts} unit="개" />
                <StatBox label="전체 주문" value={data.overview.totalOrders} unit="건" />
                <StatBox label="총 매출" value={formatKRW(data.overview.totalRevenue)} unit="원" />
                <StatBox label="총 이익" value={formatKRW(data.overview.totalProfit)} unit="원" />
                <StatBox
                  label="평균 마진"
                  value={formatPercent(data.overview.avgMargin * 100)}
                  unit=""
                />
              </div>
            </div>
          )}

          {tab === 'products' && data.products && (() => {
            const pagedProducts = data.products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="table-card">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>등급</th>
                        <th>상품명</th>
                        <th className="text-right">주문수</th>
                        <th className="text-right">매출</th>
                        <th className="text-right">순이익</th>
                        <th className="text-right">이익률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedProducts.map((product, index) => {
                        const rowNumber = (page - 1) * PAGE_SIZE + index + 1;
                        return (
                          <tr key={product.listingId}>
                            <td className="tabular-nums text-[var(--text-muted)]">
                              {rowNumber}
                            </td>
                            <td>
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-bold',
                                  getGradeColor(product.grade ?? 'N/A'),
                                )}
                              >
                                {product.grade ?? 'N/A'}
                              </span>
                            </td>
                            <td className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
                              {product.productName}
                            </td>
                            <td className="text-right tabular-nums">{product.orderCount}</td>
                            <td className="text-right tabular-nums">
                              {formatKRW(product.totalRevenue)}원
                            </td>
                            <td
                              className={cn(
                                'text-right tabular-nums',
                                product.netProfit < 0 ? 'text-red-600' : 'text-green-600',
                              )}
                            >
                              {formatKRW(product.netProfit)}원
                            </td>
                            <td
                              className={cn(
                                'text-right tabular-nums font-semibold',
                                product.profitRate < 0
                                  ? 'text-red-600'
                                  : product.profitRate <= 0.03
                                    ? 'text-amber-600'
                                    : 'text-green-600',
                              )}
                            >
                              {formatPercent(product.profitRate * 100)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  limit={PAGE_SIZE}
                  total={data.products.length}
                  onPageChange={setPage}
                />
              </div>
            );
          })()}

          {tab === 'categories' && data.categories && (() => {
            const pagedCategories = data.categories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="table-card">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>카테고리</th>
                        <th className="text-right">상품수</th>
                        <th className="text-right">매출</th>
                        <th className="text-right">순이익</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedCategories.map((category) => (
                        <tr key={category.category}>
                          <td className="font-medium text-[var(--text-primary)]">
                            {category.name}
                          </td>
                          <td className="text-right tabular-nums">{category.count}개</td>
                          <td className="text-right tabular-nums">
                            {formatKRW(category.revenue)}원
                          </td>
                          <td
                            className={cn(
                              'text-right tabular-nums',
                              category.profit < 0 ? 'text-red-600' : 'text-green-600',
                            )}
                          >
                            {formatKRW(category.profit)}원
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  limit={PAGE_SIZE}
                  total={data.categories.length}
                  onPageChange={setPage}
                />
              </div>
            );
          })()}

          {tab === 'delivery' && data.delivery && (() => {
            const dailySorted = [...data.delivery.daily].reverse();
            const pagedDaily = dailySorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="space-y-4">
                <div className="table-card">
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>날짜</th>
                          <th className="text-right">배송건수</th>
                          <th className="text-right">주문수</th>
                          <th className="text-right">매출</th>
                          <th className="text-right">수량</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedDaily.map((daily) => (
                          <tr key={daily.date}>
                            <td className="font-mono text-[var(--text-secondary)]">
                              {daily.date}
                            </td>
                            <td className="text-right tabular-nums">{daily.count}건</td>
                            <td className="text-right tabular-nums">{daily.orders}건</td>
                            <td className="text-right tabular-nums">
                              {formatKRW(daily.revenue)}원
                            </td>
                            <td className="text-right tabular-nums">{daily.qty}개</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={page}
                    limit={PAGE_SIZE}
                    total={dailySorted.length}
                    onPageChange={setPage}
                  />
                </div>
              </div>
            );
          })()}

          {tab === 'grades' && data.grades && (
            <div className="grid grid-cols-3 gap-3">
              {[...data.grades]
                .sort((left, right) => left.grade.localeCompare(right.grade))
                .map((grade) => (
                  <div
                    key={grade.grade}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                  >
                    <div className={cn('text-2xl font-bold', getGradeTextColor(grade.grade))}>
                      {grade.grade}등급
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {grade.count}개 상품
                    </div>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">매출</span>
                        <span className="font-semibold tabular-nums">
                          {formatKRW(grade.revenue)}원
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">순이익</span>
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            grade.profit < 0 ? 'text-red-600' : 'text-green-600',
                          )}
                        >
                          {formatKRW(grade.profit)}원
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">광고비</span>
                        <span className="font-semibold tabular-nums text-amber-600">
                          {formatKRW(grade.adCost)}원
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {tab === 'pareto' && data.pareto && (() => {
            const pagedPareto = data.pareto.data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatBox label="총 매출" value={formatKRW(data.pareto.totalRevenue)} unit="원" />
                  <StatBox label="A등급 (70%)" value={data.pareto.gradeDistribution.A} unit="개" />
                  <StatBox label="B등급 (20%)" value={data.pareto.gradeDistribution.B} unit="개" />
                  <StatBox label="등급 불일치" value={data.pareto.mismatchCount} unit="개" />
                </div>

                <div className="table-card">
                  <div className="table-scroll">
                    <table>
                      <thead className="sticky top-0">
                        <tr>
                          <th>#</th>
                          <th>상품명</th>
                          <th>현재등급</th>
                          <th>추천등급</th>
                          <th className="text-right">매출</th>
                          <th className="text-right">매출비율</th>
                          <th className="text-right">누적비율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedPareto.map((item) => (
                          <tr
                            key={item.id}
                            className={!item.gradeMatch ? 'bg-amber-50/60' : undefined}
                          >
                            <td className="tabular-nums text-[var(--text-muted)]">
                              {item.rank}
                            </td>
                            <td className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
                              {item.name}
                            </td>
                            <td>
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-bold',
                                  getGradeColor(item.currentGrade),
                                )}
                              >
                                {item.currentGrade}
                              </span>
                            </td>
                            <td>
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[10px] font-bold',
                                  getGradeColor(item.suggestedGrade),
                                )}
                              >
                                {item.suggestedGrade}
                              </span>
                              {!item.gradeMatch && (
                                <span className="ml-1 text-[9px] text-red-500">불일치</span>
                              )}
                            </td>
                            <td className="text-right tabular-nums">
                              {formatKRW(item.revenue)}원
                            </td>
                            <td className="text-right tabular-nums text-[var(--text-secondary)]">
                              {formatPercent(item.revenuePercent)}
                            </td>
                            <td
                              className={cn(
                                'text-right tabular-nums font-medium',
                                item.cumulativePercent <= 70
                                  ? 'text-green-600'
                                  : item.cumulativePercent <= 90
                                    ? 'text-amber-600'
                                    : 'text-red-600',
                              )}
                            >
                              {formatPercent(item.cumulativePercent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={page}
                    limit={PAGE_SIZE}
                    total={data.pareto.data.length}
                    onPageChange={setPage}
                  />
                </div>
              </div>
            );
          })()}

          {tab === 'repurchase' && data.repurchase && (() => {
            const repeatProducts = data.repurchase.repeatProducts;
            const repeatCustomers = data.repurchase.repeatCustomers;
            const pagedProducts = repeatProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            const pagedCustomers = repeatCustomers.slice(
              (pageCustomers - 1) * PAGE_SIZE,
              pageCustomers * PAGE_SIZE,
            );

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <StatBox label="전체 고객수" value={data.repurchase.totalCustomers} unit="명" />
                  <StatBox label="재구매 고객" value={data.repurchase.repeatCount} unit="명" />
                  <StatBox
                    label="재구매율"
                    value={formatPercent(data.repurchase.repurchaseRate * 100)}
                    unit=""
                  />
                </div>

                {repeatProducts.length > 0 && (
                  <div className="table-card">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                      <h3 className="section-title">재구매 상품</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>상품명</th>
                            <th>카테고리</th>
                            <th className="text-right">주문횟수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedProducts.map((product, index) => (
                            <tr key={product.masterId}>
                              <td className="tabular-nums text-[var(--text-muted)]">
                                {(page - 1) * PAGE_SIZE + index + 1}
                              </td>
                              <td className="max-w-[200px] truncate font-medium text-[var(--text-primary)]">
                                {product.productName}
                              </td>
                              <td className="text-xs text-[var(--text-secondary)]">
                                {product.category ?? '-'}
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[var(--primary)]">
                                {product.orderCount}회
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={page}
                      limit={PAGE_SIZE}
                      total={repeatProducts.length}
                      onPageChange={setPage}
                    />
                  </div>
                )}

                {repeatCustomers.length > 0 && (
                  <div className="table-card">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                      <h3 className="section-title">재구매 고객</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table>
                        <thead>
                          <tr>
                            <th>고객명</th>
                            <th className="text-right">주문횟수</th>
                            <th className="text-right">총 주문금액</th>
                            <th>마지막 주문</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedCustomers.map((customer) => (
                            <tr key={`${customer.name}-${customer.lastOrder ?? 'none'}`}>
                              <td className="font-medium text-[var(--text-primary)]">
                                {customer.name}
                              </td>
                              <td className="text-right tabular-nums font-semibold text-[var(--primary)]">
                                {customer.count}회
                              </td>
                              <td className="text-right tabular-nums">
                                {formatKRW(customer.totalAmount)}원
                              </td>
                              <td className="text-xs font-mono text-[var(--text-secondary)]">
                                {customer.lastOrder ? formatDate(customer.lastOrder) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={pageCustomers}
                      limit={PAGE_SIZE}
                      total={repeatCustomers.length}
                      onPageChange={setPageCustomers}
                    />
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

function StatBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="card-label">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-[var(--text-primary)]">
        {value}
        <span className="ml-0.5 text-sm text-[var(--text-muted)]">{unit}</span>
      </div>
    </div>
  );
}
