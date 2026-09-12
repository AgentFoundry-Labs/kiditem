'use client';

import { useAuth } from '@/hooks/useAuth';
import { useSellpiaInventorySourceOwner } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';

/**
 * Global freshness projection only. Browser collection, upload, and terminal
 * reporting are owned by the server-issued source attempt and extension.
 */
export function SellpiaInventorySyncProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { status, user } = useAuth();
  useSellpiaInventorySourceOwner({
    enabled: status === 'ready' && Boolean(user?.organizationId),
  });
  return children;
}
