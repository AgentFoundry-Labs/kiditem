'use client';

import dynamic from 'next/dynamic';
import { Warehouse, Package, ArrowUpDown, BookOpen, ClipboardCheck, DollarSign } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';

const InventoryPage = dynamic(() => import('@/app/inventory/page'), { ssr: false });
const PurchaseOrdersPage = dynamic(() => import('@/app/purchase-orders/page'), { ssr: false });
const StockIoPage = dynamic(() => import('@/app/inventory-hub/components/StockIo'), { ssr: false });
const StockLedgerPage = dynamic(() => import('@/app/inventory-hub/components/StockLedger'), { ssr: false });
const StockAuditsPage = dynamic(() => import('@/app/inventory-hub/components/StockAudits'), { ssr: false });
const StockAssetsPage = dynamic(() => import('@/app/inventory-hub/components/StockAssets'), { ssr: false });

export default function InventoryHubPage() {
  return (
    <TabLayout
      title="재고 관리"
      titleIcon={Warehouse}
      tabs={[
        { id: 'status', label: '재고 현황', icon: Warehouse, content: <InventoryPage /> },
        { id: 'po', label: '발주 관리', icon: Package, content: <PurchaseOrdersPage /> },
        { id: 'io', label: '입출고', icon: ArrowUpDown, content: <StockIoPage /> },
        { id: 'ledger', label: '수불부', icon: BookOpen, content: <StockLedgerPage /> },
        { id: 'audits', label: '재고 실사', icon: ClipboardCheck, content: <StockAuditsPage /> },
        { id: 'assets', label: '재고자산', icon: DollarSign, content: <StockAssetsPage /> },
      ]}
    />
  );
}
