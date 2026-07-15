import { redirect } from 'next/navigation';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';

export default async function StockOpsPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/stock-ops', await searchParams);
  if (destination) redirect(destination);
  return null;
}
