import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import SalesAnalysisPageContent from './components/SalesAnalysisPageContent';
import { parseSalesAnalysisTabId } from './lib/sales-analysis-tabs';

type SalesAnalysisSearchParams = {
  tab?: string | string[];
};

export default async function SalesAnalysisPage({
  searchParams,
}: {
  searchParams?: SalesAnalysisSearchParams | Promise<SalesAnalysisSearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedTab = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams?.tab[0]
    : resolvedSearchParams?.tab;

  return (
    <Suspense fallback={<PageSkeleton variant="dashboard" />}>
      <SalesAnalysisPageContent initialTab={parseSalesAnalysisTabId(requestedTab)} />
    </Suspense>
  );
}
