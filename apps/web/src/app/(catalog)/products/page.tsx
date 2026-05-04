import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import ProductsListView from '@/app/(catalog)/_shared/components/ProductsListView';

export default function ProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <ProductsListView />
    </Suspense>
  );
}
