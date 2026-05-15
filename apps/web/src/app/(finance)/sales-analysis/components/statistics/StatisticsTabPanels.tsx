import { CategoriesPanel } from './CategoriesPanel';
import { DeliveryPanel } from './DeliveryPanel';
import { GradesPanel } from './GradesPanel';
import { OverviewPanel } from './OverviewPanel';
import { ParetoPanel } from './ParetoPanel';
import { ProductsPanel } from './ProductsPanel';
import { RepurchasePanel } from './RepurchasePanel';
import type { StatisticsData, StatisticsTab } from '../../lib/statistics-data';

type StatisticsTabPanelsProps = {
  tab: StatisticsTab;
  data: StatisticsData;
  page: number;
  customerPage: number;
  onPageChange: (page: number) => void;
  onCustomerPageChange: (page: number) => void;
};

export function StatisticsTabPanels({
  tab,
  data,
  page,
  customerPage,
  onPageChange,
  onCustomerPageChange,
}: StatisticsTabPanelsProps) {
  switch (tab) {
    case 'overview':
      return data.overview ? <OverviewPanel overview={data.overview} /> : null;
    case 'products':
      return data.products ? (
        <ProductsPanel products={data.products} page={page} onPageChange={onPageChange} />
      ) : null;
    case 'categories':
      return data.categories ? (
        <CategoriesPanel
          categories={data.categories}
          page={page}
          onPageChange={onPageChange}
        />
      ) : null;
    case 'delivery':
      return data.delivery ? (
        <DeliveryPanel delivery={data.delivery} page={page} onPageChange={onPageChange} />
      ) : null;
    case 'grades':
      return data.grades ? <GradesPanel grades={data.grades} /> : null;
    case 'pareto':
      return data.pareto ? (
        <ParetoPanel pareto={data.pareto} page={page} onPageChange={onPageChange} />
      ) : null;
    case 'repurchase':
      return data.repurchase ? (
        <RepurchasePanel
          repurchase={data.repurchase}
          productPage={page}
          customerPage={customerPage}
          onProductPageChange={onPageChange}
          onCustomerPageChange={onCustomerPageChange}
        />
      ) : null;
    default: {
      const unreachable: never = tab;
      throw new Error(`Unknown statistics tab: ${unreachable}`);
    }
  }
}
