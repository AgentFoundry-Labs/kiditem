'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  Warehouse,
  Package,
  ArrowUpDown,
  BookOpen,
  ClipboardCheck,
  DollarSign,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import PageSkeleton from '@/components/ui/PageSkeleton';

const InventoryPage = dynamic(() => import('@/app/(inventory)/inventory/page'), { ssr: false });
const PurchaseOrdersPage = dynamic(() => import('@/app/(supply)/purchase-orders/page'), { ssr: false });
const StockIoPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/StockIo'), { ssr: false });
const StockLedgerPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/StockLedger'), { ssr: false });
const StockAuditsPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/StockAudits'), { ssr: false });
const StockAssetsPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/StockAssets'), { ssr: false });
const SellpiaSyncPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/SellpiaSync'), { ssr: false });
const RocketStockEventsPage = dynamic(() => import('@/app/(inventory)/inventory-hub/components/RocketStockEvents'), { ssr: false });

export default function InventoryHubPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <InventoryHubContent />
    </Suspense>
  );
}

function InventoryHubContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const defaultTab = requestedTab === 'rocket-events' || requestedTab === 'sellpia-sync'
    ? requestedTab
    : undefined;

  return (
    <TabLayout
      title="재고 관리"
      titleIcon={Warehouse}
      defaultTab={defaultTab}
      wrapTabs
      tabs={[
        { id: 'status', label: '재고 현황', icon: Warehouse, content: <InventoryPage /> },
        { id: 'po', label: '발주 관리', icon: Package, content: <PurchaseOrdersPage /> },
        { id: 'io', label: '입출고', icon: ArrowUpDown, content: <StockIoPage /> },
        { id: 'sellpia-sync', label: 'Sellpia 동기화', icon: RefreshCw, content: <SellpiaSyncPage /> },
        { id: 'rocket-events', label: '로켓 수동 처리', icon: RotateCcw, content: <RocketStockEventsPage /> },
        { id: 'ledger', label: '수불부', icon: BookOpen, content: <StockLedgerPage /> },
        { id: 'audits', label: '재고 실사', icon: ClipboardCheck, content: <StockAuditsPage /> },
        { id: 'assets', label: '재고자산', icon: DollarSign, content: <StockAssetsPage /> },
      ]}
    />
  );
}
