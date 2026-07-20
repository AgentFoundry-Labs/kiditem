'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, RotateCcw, SearchCheck, Warehouse } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { GeneralPurchaseOrdersWorkspace } from '@/app/(supply)/purchase-orders/components/GeneralPurchaseOrdersWorkspace';
import { InventoryWorkspace } from './components/InventoryWorkspace';
import StockAssets from './components/StockAssets';
// 재고분석(/stock-ops)에서 넘어온 점검·기록 뷰. 컴포넌트만 재사용하고 라우트는 /stock-ops 에 남긴다.
import ImportFreshness from '../stock-ops/components/ImportFreshness';
import MappingAttention from '../stock-ops/components/MappingAttention';
import ReturnTransfers from '../stock-ops/components/ReturnTransfers';
import StockTransfers from '../stock-ops/components/StockTransfers';
import ZeroItems from '../stock-ops/components/ZeroItems';
import { RocketInventoryWorkspace } from './components/InventoryOperationWorkspaces';

const TAB_IDS = ['status', 'sellpia-sync', 'rocket-events', 'checks'] as const;
type TabId = (typeof TAB_IDS)[number];

// 4탭으로 접히면서 사라진 예전 탭 id들. 외부 딥링크와 북마크가 새 위치로 착지하게 한다.
// 발주·입출고·수불부·재고자산은 이제 재고 현황 한 화면 안의 섹션이다.
const LEGACY_TAB_TARGETS: Readonly<Record<string, TabId>> = {
  inventory: 'status',
  po: 'status',
  io: 'status',
  ledger: 'status',
  assets: 'status',
  records: 'status',
  history: 'status',
  overview: 'sellpia-sync',
  audits: 'sellpia-sync',
  freshness: 'sellpia-sync',
  attention: 'rocket-events',
  'sellpia-zero': 'checks',
  'mapping-attention': 'checks',
};

export default function InventoryHubPage() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><InventoryHubContent /></Suspense>;
}

function InventoryHubContent() {
  const router = useRouter();
  const requestedTab = useSearchParams().get('tab');
  // hasOwn 으로 조회해야 ?tab=constructor 같은 프로토타입 키가 리다이렉트 대상으로 잡히지 않는다.
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
      headerActions={<SellpiaWorkspaceFreshnessStatus />}
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      unmountInactive
      tabs={[
        { id: 'status', label: '재고 현황', icon: Warehouse, content: <StatusWorkspace /> },
        { id: 'sellpia-sync', label: 'Sellpia 동기화', icon: RefreshCw, content: <SellpiaSyncWorkspace /> },
        { id: 'rocket-events', label: '로켓 수동 처리', icon: RotateCcw, content: <RocketInventoryWorkspace /> },
        { id: 'checks', label: '재고 점검', icon: SearchCheck, content: <ChecksWorkspace /> },
      ]}
    />
  );
}

// 발주·입출고·재고자산을 한 화면에 세로로 쌓는다.
// 수불부는 입출고와 같은 이관·반품 기록을 읽기전용으로 보던 화면이라 흡수했다.
function StatusWorkspace() {
  return (
    <div className="space-y-10">
      <InventoryWorkspace headingLevel={2} />
      <HubSection><StockAssets /></HubSection>
      <HubSection><GeneralPurchaseOrdersWorkspace headingLevel={2} /></HubSection>
      <HubSection><StockTransfers /></HubSection>
      <HubSection><ReturnTransfers /></HubSection>
    </div>
  );
}

// 재고 실사·가져오기 상태는 모두 같은 import-run 이력을 보던 화면이라 동기화 하나로 접었다.
function SellpiaSyncWorkspace() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sellpia 동기화</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            최신성 상태를 열어 자동 다운로드·수동 가져오기를 실행하고, 아래에서 스냅샷 실사 기록을 확인합니다.
          </p>
        </div>
        <SellpiaWorkspaceFreshnessStatus />
      </div>
      <ImportFreshness />
    </section>
  );
}

function ChecksWorkspace() {
  return (
    <div className="space-y-10">
      <ZeroItems />
      <HubSection><MappingAttention /></HubSection>
    </div>
  );
}

/** 한 탭 안에 쌓인 섹션들을 구분선으로 나눈다. */
function HubSection({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[var(--border)] pt-10">{children}</div>;
}
