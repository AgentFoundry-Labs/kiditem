import {
  BarChart3,
  Package,
  PieChart,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  StatisticsCategoriesResponseSchema,
  StatisticsGradesResponseSchema,
  StatisticsOverviewSchema,
  StatisticsParetoResponseSchema,
  StatisticsProductsResponseSchema,
  StatisticsRepurchaseResponseSchema,
} from '@kiditem/shared/statistics';
import { apiClient } from '@/lib/api-client';
import type {
  StatisticsCategoriesResponse,
  StatisticsGradesResponse,
  StatisticsOverview,
  StatisticsParetoResponse,
  StatisticsProductsResponse,
  StatisticsRepurchaseResponse,
} from '@kiditem/shared/statistics';
import type { FinanceBasisNoticeBasis } from '../../_shared/components/FinanceBasisNotice';

export type StatisticsTab =
  | 'overview'
  | 'products'
  | 'categories'
  | 'grades'
  | 'pareto'
  | 'repurchase';

export type StatisticsData = {
  overview?: StatisticsOverview;
  products?: StatisticsProductsResponse;
  categories?: StatisticsCategoriesResponse;
  grades?: StatisticsGradesResponse;
  pareto?: StatisticsParetoResponse;
  repurchase?: StatisticsRepurchaseResponse;
};

export const PAGE_SIZE = 20;

export const statisticsTabs: Array<{
  key: StatisticsTab;
  label: string;
  icon: LucideIcon;
}> = [
  { key: 'overview', label: '전체 개요', icon: TrendingUp },
  { key: 'products', label: '제품별', icon: Package },
  { key: 'categories', label: '카테고리별', icon: BarChart3 },
  { key: 'grades', label: '등급별', icon: BarChart3 },
  { key: 'pareto', label: '매출 파레토', icon: PieChart },
  { key: 'repurchase', label: '재구매율', icon: Users },
];

export async function fetchStatisticsTab(
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
          StatisticsProductsResponseSchema,
        ),
      };
    case 'categories':
      return {
        categories: await apiClient.getParsed(
          `/api/statistics?type=categories&period=${period}`,
          StatisticsCategoriesResponseSchema,
        ),
      };
    case 'grades':
      return {
        grades: await apiClient.getParsed(
          `/api/statistics?type=grades&period=${period}`,
          StatisticsGradesResponseSchema,
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

export function isTabEmpty(tab: StatisticsTab, data: StatisticsData): boolean {
  switch (tab) {
    case 'products':
      return !data.products || data.products.rows.length === 0;
    case 'categories':
      return !data.categories || data.categories.rows.length === 0;
    case 'grades':
      return !data.grades || data.grades.rows.length === 0;
    case 'pareto':
      return !data.pareto || data.pareto.data.length === 0;
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

/** The evidence the server published beside the open tab's values. */
export function statisticsTabBasis(tab: StatisticsTab, data: StatisticsData): FinanceBasisNoticeBasis {
  switch (tab) {
    case 'overview':
      return data.overview?.basis;
    case 'products':
      return data.products?.basis;
    case 'categories':
      return data.categories?.basis;
    case 'grades':
      return data.grades?.basis;
    case 'pareto':
      return data.pareto?.basis;
    case 'repurchase':
      return data.repurchase?.basis ? { revenue: data.repurchase.basis.orders } : null;
    default: {
      const unreachable: never = tab;
      throw new Error(`Unknown statistics tab: ${unreachable}`);
    }
  }
}
