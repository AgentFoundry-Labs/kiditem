import { redirect } from 'next/navigation';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';

export default async function OrderStatusHubPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/order-status-hub', await searchParams);
  if (destination) redirect(destination);
  return null;
}
