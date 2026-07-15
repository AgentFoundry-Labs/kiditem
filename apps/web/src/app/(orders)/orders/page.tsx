import { redirect } from 'next/navigation';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/orders', await searchParams);
  if (destination) redirect(destination);
  return null;
}
