'use client';

import { useAuth } from '@/hooks/useAuth';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';

/**
 * Global freshness projection only. Browser claiming, snapshot collection,
 * upload, and terminal reporting are owned by the server-issued OperationRun
 * and the extension runtime so a web-tab lifecycle cannot own a sync attempt.
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
