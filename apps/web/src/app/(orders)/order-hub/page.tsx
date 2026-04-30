'use client';

import dynamic from 'next/dynamic';
import { ShoppingCart, ListChecks, Truck, Link2Off } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const OrdersPage = dynamic(() => import('@/app/orders/page'), { ssr: false });
const SmartPickingPage = dynamic(() => import('@/app/order-hub/components/SmartPicking'), { ssr: false });
const OutboundMgmtPage = dynamic(() => import('@/app/order-hub/components/OutboundMgmt'), { ssr: false });
const OrderMatchingPage = dynamic(() => import('@/app/order-hub/components/OrderMatching'), { ssr: false });

export default function OrderHubPage() {
  return (
    <TabLayout
      title="주문 처리"
      titleIcon={ShoppingCart}
      tabs={[
        { id: 'orders', label: '주문 관리', icon: ShoppingCart, content: <OrdersPage /> },
        { id: 'picking', label: '스마트 피킹', icon: ListChecks, content: <SmartPickingPage /> },
        { id: 'outbound', label: '출고 관리', icon: Truck, content: <OutboundMgmtPage /> },
        { id: 'matching', label: '미매칭 주문', icon: Link2Off, content: <OrderMatchingPage /> },
      ]}
    />
  );
}
