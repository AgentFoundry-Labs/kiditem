'use client';

import { useAuth } from '@/hooks/useAuth';
import { useSellpiaInventoryCollection } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';

/**
 * Global freshness projection only: it keeps the Sellpia status read current
 * and refreshes stock readers after a newer generation. Collection starts only
 * from a mounted collection control.
 */
export function SellpiaInventorySyncProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { status, user } = useAuth();
  useSellpiaInventoryCollection({
    enabled: status === 'ready' && Boolean(user?.organizationId),
  });
  return children;
}
