'use client';

import { AlertTriangle, ClipboardList, PackageCheck, ShoppingCart } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { OrderCollectionWorkspace } from './OrderCollectionWorkspace';
import { OrderExceptionsWorkspace } from './OrderExceptionsWorkspace';
import { OrderProcessingWorkspace } from './OrderProcessingWorkspace';
import { OrderShippingWorkspace } from './OrderShippingWorkspace';

const ORDER_TABS = ['collection', 'processing', 'shipping', 'exceptions'] as const;

export function OrderHubWorkspace() {
  const [activeTab, setActiveTab] = useUrlControlledTab({
    key: 'tab',
    values: ORDER_TABS,
    defaultValue: 'collection',
  });

  return (
    <TabLayout
      title="주문 운영"
      titleIcon={ShoppingCart}
      headerActions={<SellpiaWorkspaceFreshnessStatus />}
      activeTab={activeTab}
      onTabChange={(next) => setActiveTab(next as (typeof ORDER_TABS)[number])}
      unmountInactive
      tabs={[
        { id: 'collection', label: '주문 수집', icon: ClipboardList, content: <OrderCollectionWorkspace /> },
        { id: 'processing', label: '주문 처리', icon: ShoppingCart, content: <OrderProcessingWorkspace /> },
        { id: 'shipping', label: '배송', icon: PackageCheck, content: <OrderShippingWorkspace /> },
        { id: 'exceptions', label: '예외', icon: AlertTriangle, content: <OrderExceptionsWorkspace /> },
      ]}
    />
  );
}
