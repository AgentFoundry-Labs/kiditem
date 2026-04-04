'use client';

import dynamic from 'next/dynamic';
import TabLayout from '@/components/ui/TabLayout';
import { ClipboardList, PackageSearch, Search, GitCompare, RefreshCw } from 'lucide-react';

const OrderInventoryPage = dynamic(() => import('@/app/order-status-hub/components/OrderInventory'), { ssr: false });
const DeliverySearchPage = dynamic(() => import('@/app/order-status-hub/components/DeliverySearch'), { ssr: false });
const OrderComparePage = dynamic(() => import('@/app/order-status-hub/components/OrderCompare'), { ssr: false });
const SyncCheckPage = dynamic(() => import('@/app/order-status-hub/components/SyncCheck'), { ssr: false });

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
