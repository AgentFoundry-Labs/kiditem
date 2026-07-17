'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileSpreadsheet, Link2Off, ListChecks, ShoppingCart, Truck } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { OrderCollectionWorkspace } from './components/OrderCollectionWorkspace';
import { OrderProcessingWorkspace } from './components/OrderProcessingWorkspace';
import OrderMatching from './components/OrderMatching';
import { OutboundWorkspace } from './components/OutboundWorkspace';
import SmartPicking from './components/SmartPicking';

const TAB_IDS = ['orders', 'collection', 'picking', 'outbound', 'matching'] as const;
type TabId = (typeof TAB_IDS)[number];

function initialTab(requested: string | null): TabId {
  if (requested === 'processing') return 'orders';
  if (requested === 'shipping') return 'outbound';
  return TAB_IDS.find((tab) => tab === requested) ?? 'orders';
}

export default function OrderHubPage() {
  const requestedTab = useSearchParams().get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(() => initialTab(requestedTab));

  return (
    <TabLayout
      title="주문 처리"
      titleIcon={ShoppingCart}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      unmountInactive
      tabs={[
        { id: 'orders', label: '주문 관리', icon: ShoppingCart, content: <OrderProcessingWorkspace headingLevel={2} includePicking={false} /> },
        { id: 'collection', label: '주문수집', icon: FileSpreadsheet, content: <OrderCollectionWorkspace headingLevel={2} /> },
        { id: 'picking', label: '스마트 피킹', icon: ListChecks, content: <SmartPicking /> },
        { id: 'outbound', label: '출고 관리', icon: Truck, content: <OutboundWorkspace headingLevel={2} /> },
        { id: 'matching', label: '미매칭 주문', icon: Link2Off, content: <OrderMatching /> },
      ]}
    />
  );
}
