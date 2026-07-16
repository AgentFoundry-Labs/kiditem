'use client';

import dynamic from 'next/dynamic';
import { ClipboardList, GitCompare, PackageSearch, RefreshCw, Search } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const OrderInventoryPage = dynamic(() => import('./components/OrderInventory'), { ssr: false });
const DeliverySearchPage = dynamic(() => import('./components/DeliverySearch'), { ssr: false });
const OrderComparePage = dynamic(() => import('./components/OrderCompare'), { ssr: false });
const SyncCheckPage = dynamic(() => import('./components/SyncCheck'), { ssr: false });

export default function OrderStatusHubPage() {
  return (
    <TabLayout
      title="주문 현황"
      titleIcon={ClipboardList}
      tabs={[
        { id: 'inventory', label: '주문-재고', icon: PackageSearch, content: <OrderInventoryPage /> },
        { id: 'delivery', label: '배송 검색', icon: Search, content: <DeliverySearchPage /> },
        { id: 'compare', label: '주문 비교', icon: GitCompare, content: <OrderComparePage /> },
        { id: 'sync', label: '동기화 체크', icon: RefreshCw, content: <SyncCheckPage /> },
      ]}
    />
  );
}
