'use client';

import { SellpiaFreshnessStatus } from './SellpiaFreshnessStatus';
import { useSellpiaInventorySyncContext } from './SellpiaInventorySyncContext';

export function SellpiaWorkspaceFreshnessStatus() {
  const context = useSellpiaInventorySyncContext();
  if (!context) return null;
  return (
    <SellpiaFreshnessStatus
      status={context.state.status}
      lastVerifiedAt={context.state.lastVerifiedAt}
      onOpen={context.openDrawer}
      placement="inline"
    />
  );
}
