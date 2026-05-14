import {
  BarChart3,
  Package,
  PieChart,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
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
import { apiClient } from '@/lib/api-client';
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

export type StatisticsTab =
  | 'overview'
  | 'products'
  | 'categories'
  | 'delivery'
  | 'grades'
  | 'pareto'
  | 'repurchase';

export type StatisticsData = {
  overview?: StatisticsOverview;
  products?: StatisticsProductRow[];
  categories?: StatisticsCategoryRow[];
  delivery?: StatisticsDeliveryResponse;
  grades?: StatisticsGradeRow[];
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
  { key: 'delivery', label: '배송/일별', icon: Truck },
  { key: 'grades', label: '등급별', icon: BarChart3 },
  { key: 'pareto', label: 'ABC 파레토', icon: PieChart },
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

export function isTabEmpty(tab: StatisticsTab, data: StatisticsData): boolean {
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
