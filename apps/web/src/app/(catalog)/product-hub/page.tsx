import { Suspense } from 'react';
import ProductsPage from '@/app/(catalog)/products/page';
import PageSkeleton from '@/components/ui/PageSkeleton';

export default function ProductHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <ProductsPage />
    </Suspense>
  );
}
