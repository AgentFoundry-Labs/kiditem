import { redirect } from 'next/navigation';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';

export default async function RocketOrdersPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/rocket-orders', await searchParams);
  if (destination) redirect(destination);
  return null;
}
