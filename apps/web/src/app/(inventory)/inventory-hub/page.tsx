'use client';

import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  ArrowUpDown,
  BookOpen,
  ClipboardCheck,
  DollarSign,
  Package,
  RefreshCw,
  RotateCcw,
  Warehouse,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';
import {
  InventoryAuditWorkspace,
  InventoryIoWorkspace,
  InventoryLedgerWorkspace,
  RocketInventoryWorkspace,
} from './components/InventoryOperationWorkspaces';
import SellpiaSyncWorkspace from './components/SellpiaSyncWorkspace';

const InventoryPage = dynamic(() => import('@/app/(inventory)/inventory/page'), { ssr: false });
const PurchaseOrdersPage = dynamic(() => import('@/app/(supply)/purchase-orders/page'), { ssr: false });
const StockAssets = dynamic(() => import('./components/StockAssets'), { ssr: false });

const TAB_IDS = ['status', 'po', 'io', 'sellpia-sync', 'rocket-events', 'ledger', 'audits', 'assets'] as const;

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
        { id: 'status', label: '재고 현황', icon: Warehouse, content: activeTab === 'status' ? <InventoryPage /> : null },
        { id: 'po', label: '발주 관리', icon: Package, content: activeTab === 'po' ? <PurchaseOrdersPage /> : null },
        { id: 'io', label: '입출고', icon: ArrowUpDown, content: activeTab === 'io' ? <InventoryIoWorkspace /> : null },
        { id: 'sellpia-sync', label: 'Sellpia 동기화', icon: RefreshCw, content: activeTab === 'sellpia-sync' ? <SellpiaSyncWorkspace /> : null },
        { id: 'rocket-events', label: '로켓 수동 처리', icon: RotateCcw, content: activeTab === 'rocket-events' ? <RocketInventoryWorkspace /> : null },
        { id: 'ledger', label: '수불부', icon: BookOpen, content: activeTab === 'ledger' ? <InventoryLedgerWorkspace /> : null },
        { id: 'audits', label: '재고 실사', icon: ClipboardCheck, content: activeTab === 'audits' ? <InventoryAuditWorkspace /> : null },
        { id: 'assets', label: '재고자산', icon: DollarSign, content: activeTab === 'assets' ? <StockAssets /> : null },
      ]}
    />
  );
}
