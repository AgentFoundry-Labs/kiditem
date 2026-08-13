'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers, Warehouse } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import ReturnTransfers from '../stock-ops/components/ReturnTransfers';
import StockTransfers from '../stock-ops/components/StockTransfers';
import { SellpiaInventoryWorkspace } from './components/SellpiaInventoryWorkspace';
import { InventoryWorkspace } from './components/InventoryWorkspace';

const TAB_IDS = ['status', 'sellpia-inventory'] as const;
type TabId = (typeof TAB_IDS)[number];

// 재고 관리 화면에서 제거된 탭과 예전 분석 화면의 tab 값은 재고 현황으로 정규화한다.
const LEGACY_TAB_TARGETS: Readonly<Record<string, TabId>> = {
  inventory: 'status',
  po: 'status',
  io: 'status',
  ledger: 'status',
  assets: 'status',
  records: 'status',
  history: 'status',
  overview: 'status',
  audits: 'status',
  freshness: 'status',
  attention: 'status',
  checks: 'status',
  'sellpia-sync': 'status',
  'rocket-events': 'status',
  'sellpia-zero': 'status',
  'mapping-attention': 'status',
};

export default function InventoryHubPage() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><InventoryHubContent /></Suspense>;
}

function InventoryHubContent() {
  const router = useRouter();
  const requestedTab = useSearchParams().get('tab');
  // hasOwn으로 조회해야 ?tab=constructor 같은 프로토타입 키가 리다이렉트 대상으로 잡히지 않는다.
  const legacyTarget = requestedTab !== null && Object.hasOwn(LEGACY_TAB_TARGETS, requestedTab)
    ? LEGACY_TAB_TARGETS[requestedTab]
    : undefined;
  const [activeTab, setActiveTab] = useUrlControlledTab({
    key: 'tab',
    values: TAB_IDS,
    defaultValue: 'status',
  });

  useEffect(() => {
    if (legacyTarget) router.replace(`/inventory-hub?tab=${legacyTarget}`);
  }, [legacyTarget, router]);

  if (legacyTarget) return <PageSkeleton variant="table" />;

  return (
    <TabLayout
      title="재고 관리"
      titleIcon={Warehouse}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      unmountInactive
      tabs={[
        { id: 'status', label: '재고 현황', icon: Warehouse, content: <StatusWorkspace /> },
        { id: 'sellpia-inventory', label: '셀피아 재고', icon: Layers, content: <SellpiaInventoryWorkspace /> },
      ]}
    />
  );
}

function StatusWorkspace() {
  return (
    <div className="space-y-10">
      <InventoryWorkspace headingLevel={2} />
      <HubSection><StockTransfers /></HubSection>
      <HubSection><ReturnTransfers /></HubSection>
    </div>
  );
}

/** 한 탭 안에 쌓인 섹션들을 구분선으로 나눈다. */
function HubSection({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[var(--border)] pt-10">{children}</div>;
}
