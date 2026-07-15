import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ProductHubWorkspace } from './components/ProductHubWorkspace';

export default function ProductHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <ProductHubWorkspace />
    </Suspense>
  );
}
