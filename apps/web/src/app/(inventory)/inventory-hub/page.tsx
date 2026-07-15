import { Suspense } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { InventoryHubWorkspace } from './components/InventoryHubWorkspace';

export default function InventoryHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <InventoryHubWorkspace />
    </Suspense>
  );
}
