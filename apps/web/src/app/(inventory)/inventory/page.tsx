import { redirect } from 'next/navigation';
import { resolveOperationsRedirect, type OperationsSearchParams } from '@/lib/operations-navigation';

export default async function InventoryPage({ searchParams }: { searchParams: Promise<OperationsSearchParams> }) {
  const destination = resolveOperationsRedirect('/inventory', await searchParams);
  if (destination) redirect(destination);
  return null;
}
