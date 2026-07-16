import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import ProductsPageContent from './components/ProductsPageContent';

export default function ProductHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <ProductsPageContent headingLevel={1} />
    </Suspense>
  );
}
