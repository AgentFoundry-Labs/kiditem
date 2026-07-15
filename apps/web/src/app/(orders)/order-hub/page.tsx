import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';
import { OrderHubWorkspace } from './components/OrderHubWorkspace';

export default async function OrderHubPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/order-hub', await searchParams);
  if (destination) redirect(destination);

  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <OrderHubWorkspace />
    </Suspense>
  );
}
