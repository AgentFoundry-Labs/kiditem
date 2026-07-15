'use client';

import { createContext, useContext } from 'react';
import type { SellpiaInventoryFreshnessView } from '@kiditem/shared/sellpia-inventory-freshness';

export type SellpiaInventorySyncContextValue = {
  state: SellpiaInventoryFreshnessView;
  openDrawer: () => void;
};

export const SellpiaInventorySyncContext = createContext<SellpiaInventorySyncContextValue | null>(null);

export function useSellpiaInventorySyncContext() {
  return useContext(SellpiaInventorySyncContext);
}
