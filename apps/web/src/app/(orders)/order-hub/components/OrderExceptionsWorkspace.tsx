'use client';

import { AlertTriangle, GitCompare, PackageSearch, RefreshCw } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import OrderCompare from '../../order-status-hub/components/OrderCompare';
import OrderInventory from '../../order-status-hub/components/OrderInventory';
import SyncCheck from '../../order-status-hub/components/SyncCheck';
import { UnshippedItemsWorkspace } from './UnshippedItemsWorkspace';

const EXCEPTION_VIEWS = ['unshipped', 'inventory', 'compare', 'sync'] as const;

export function OrderExceptionsWorkspace() {
  const [view, setView] = useUrlControlledTab({
    key: 'view',
    values: EXCEPTION_VIEWS,
    defaultValue: 'unshipped',
  });

  return (
    <TabLayout
      title="주문 예외"
      headingLevel={2}
      activeTab={view}
      onTabChange={(next) => setView(next as (typeof EXCEPTION_VIEWS)[number])}
      unmountInactive
      tabs={[
        { id: 'unshipped', label: '미배송', icon: AlertTriangle, content: <UnshippedItemsWorkspace /> },
        { id: 'inventory', label: '재고 위험', icon: PackageSearch, content: <OrderInventory /> },
        { id: 'compare', label: '주문 비교', icon: GitCompare, content: <OrderCompare /> },
        { id: 'sync', label: '동기화 확인', icon: RefreshCw, content: <SyncCheck /> },
      ]}
    />
  );
}
