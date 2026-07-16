'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUpDown, BookOpen, ClipboardCheck, DollarSign, Package, RefreshCw, RotateCcw, Warehouse } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { GeneralPurchaseOrdersWorkspace } from '@/app/(supply)/purchase-orders/components/GeneralPurchaseOrdersWorkspace';
import { InventoryWorkspace } from './components/InventoryWorkspace';
import StockAssets from './components/StockAssets';
import {
  InventoryAuditWorkspace,
  InventoryIoWorkspace,
  InventoryLedgerWorkspace,
  InventoryOverviewWorkspace,
  RocketInventoryWorkspace,
} from './components/InventoryOperationWorkspaces';

const TAB_IDS = ['status', 'po', 'io', 'sellpia-sync', 'rocket-events', 'ledger', 'audits', 'assets'] as const;
type TabId = (typeof TAB_IDS)[number];

function initialTab(requested: string | null): TabId {
  if (requested === 'inventory') return 'status';
  if (requested === 'overview') return 'sellpia-sync';
  if (requested === 'attention') return 'rocket-events';
  if (requested === 'history') return 'ledger';
  return TAB_IDS.find((tab) => tab === requested) ?? 'status';
}

export default function InventoryHubPage() {
  const requestedTab = useSearchParams().get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(() => initialTab(requestedTab));

  return (
    <TabLayout
      title="재고 관리"
      titleIcon={Warehouse}
      headerActions={<SellpiaWorkspaceFreshnessStatus />}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      wrapTabs
      unmountInactive
      tabs={[
        { id: 'status', label: '재고 현황', icon: Warehouse, content: <InventoryWorkspace headingLevel={2} /> },
        { id: 'po', label: '발주 관리', icon: Package, content: <GeneralPurchaseOrdersWorkspace headingLevel={2} /> },
        { id: 'io', label: '입출고', icon: ArrowUpDown, content: <InventoryIoWorkspace /> },
        { id: 'sellpia-sync', label: 'Sellpia 동기화', icon: RefreshCw, content: <SellpiaSyncWorkspace /> },
        { id: 'rocket-events', label: '로켓 수동 처리', icon: RotateCcw, content: <RocketInventoryWorkspace /> },
        { id: 'ledger', label: '수불부', icon: BookOpen, content: <InventoryLedgerWorkspace /> },
        { id: 'audits', label: '재고 실사', icon: ClipboardCheck, content: <InventoryAuditWorkspace /> },
        { id: 'assets', label: '재고자산', icon: DollarSign, content: <StockAssets /> },
      ]}
    />
  );
}

function SellpiaSyncWorkspace() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sellpia 동기화</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            최신성 상태를 열어 자동 다운로드·수동 가져오기와 통합 실행 이력을 관리합니다.
          </p>
        </div>
        <SellpiaWorkspaceFreshnessStatus />
      </div>
      <InventoryOverviewWorkspace />
    </section>
  );
}
