'use client';

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Boxes, CircleDollarSign, History, Link2, Package, RefreshCw, Warehouse } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';

const InventoryPage = dynamic(() => import('@/app/(inventory)/inventory/page'), { ssr: false });
const PurchaseOrdersPage = dynamic(() => import('@/app/(supply)/purchase-orders/page'), { ssr: false });
const SellpiaInventoryImport = dynamic(() => import('./components/SellpiaInventoryImport'), { ssr: false });
const SellpiaImportHistory = dynamic(() => import('./components/SellpiaImportHistory'), { ssr: false });
const StockAssets = dynamic(() => import('./components/StockAssets'), { ssr: false });
const ChannelAvailability = dynamic(() => import('./components/ChannelAvailability'), { ssr: false });

const TAB_IDS = ['status', 'sellpia-sync', 'history', 'assets', 'availability', 'po'] as const;

export default function InventoryHubPage() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><InventoryHubContent /></Suspense>;
}

function InventoryHubContent() {
  const requestedTab = useSearchParams().get('tab');
  const initialTab = TAB_IDS.find((id) => id === requestedTab) ?? 'status';
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <TabLayout
      title="재고 관리"
      titleIcon={Warehouse}
      activeTab={activeTab}
      onTabChange={(tabId) => setActiveTab(tabId as (typeof TAB_IDS)[number])}
      wrapTabs
      tabs={[
        { id: 'status', label: '재고 현황', icon: Boxes, content: activeTab === 'status' ? <InventoryPage /> : null },
        { id: 'sellpia-sync', label: 'Sellpia 재고 가져오기', icon: RefreshCw, content: activeTab === 'sellpia-sync' ? <SellpiaInventoryImport /> : null },
        { id: 'history', label: '가져오기 이력', icon: History, content: activeTab === 'history' ? <SellpiaImportHistory /> : null },
        { id: 'assets', label: '재고자산', icon: CircleDollarSign, content: activeTab === 'assets' ? <StockAssets /> : null },
        { id: 'availability', label: '채널 가용재고', icon: Link2, content: activeTab === 'availability' ? <ChannelAvailability /> : null },
        { id: 'po', label: '발주 관리', icon: Package, content: activeTab === 'po' ? <PurchaseOrdersPage /> : null },
      ]}
    />
  );
}
