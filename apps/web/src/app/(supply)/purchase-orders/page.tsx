import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { PurchaseOrdersWorkspace } from './components/PurchaseOrdersWorkspace';

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <PurchaseOrdersWorkspace />
    </Suspense>
  );
}
