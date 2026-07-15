import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';
import { InventoryHubWorkspace } from './components/InventoryHubWorkspace';

export default async function InventoryHubPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/inventory-hub', await searchParams);
  if (destination) redirect(destination);

  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <InventoryHubWorkspace />
    </Suspense>
  );
}
