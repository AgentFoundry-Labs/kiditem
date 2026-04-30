import { Suspense } from 'react';
import ProductsListView from '@/app/(catalog)/_shared/components/ProductsListView';
import PageSkeleton from '@/components/ui/PageSkeleton';

export default function ProductHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <ProductsListView />
    </Suspense>
  );
}
