import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { OrderHubWorkspace } from './components/OrderHubWorkspace';

export default function OrderHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <OrderHubWorkspace />
    </Suspense>
  );
}
