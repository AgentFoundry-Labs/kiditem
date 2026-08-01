'use client';

import { useAuth } from '@/hooks/useAuth';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';

/**
 * Global freshness projection only. Browser claiming, scoped Sellpia
 * collection, upload, and terminal reporting are owned by the server-issued
 * OperationRun and the extension runtime.
 */
export function SellpiaInventorySyncProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { status, user } = useAuth();
  useSellpiaInventoryFreshness({
    enabled: status === 'ready' && Boolean(user?.organizationId),
  });
  return children;
}
