'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, RotateCcw, Warehouse } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import { InventoryWorkspace } from './components/InventoryWorkspace';
// 재고분석(/stock-ops)에서 넘어온 동기화·기록 뷰. 컴포넌트만 재사용하고 라우트는 /stock-ops 에 남긴다.
import ImportFreshness from '../stock-ops/components/ImportFreshness';
import ReturnTransfers from '../stock-ops/components/ReturnTransfers';
import StockTransfers from '../stock-ops/components/StockTransfers';
import { RocketInventoryWorkspace } from './components/InventoryOperationWorkspaces';

const TAB_IDS = ['status', 'sellpia-sync', 'rocket-events'] as const;
type TabId = (typeof TAB_IDS)[number];

// 3탭으로 접히면서 사라진 예전 탭 id들. 외부 딥링크와 북마크가 새 위치로 착지하게 한다.
// 예전 발주·재고자산 링크는 재고 현황으로 보내되 해당 정보는 이 화면에 노출하지 않는다.
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
  checks: 'status',
  'sellpia-zero': 'status',
  'mapping-attention': 'status',
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
      activeTab={activeTab}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      unmountInactive
      tabs={[
        { id: 'status', label: '재고 현황', icon: Warehouse, content: <StatusWorkspace /> },
        { id: 'sellpia-sync', label: 'Sellpia 동기화', icon: RefreshCw, content: <SellpiaSyncWorkspace /> },
        { id: 'rocket-events', label: '로켓 수동 처리', icon: RotateCcw, content: <RocketInventoryWorkspace /> },
      ]}
    />
  );
}

// 재고 현황과 입출고 기록만 한 화면에 세로로 쌓는다.
function StatusWorkspace() {
  return (
    <div className="space-y-10">
      <InventoryWorkspace headingLevel={2} />
      <HubSection><StockTransfers /></HubSection>
      <HubSection><ReturnTransfers /></HubSection>
    </div>
  );
}

// 재고 실사·가져오기 상태는 모두 같은 import-run 이력을 보던 화면이라 동기화 하나로 접었다.
function SellpiaSyncWorkspace() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sellpia 동기화</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          자동 재고 동기화 결과와 스냅샷 실사 기록을 확인합니다.
        </p>
      </div>
      <ImportFreshness />
    </section>
  );
}

/** 한 탭 안에 쌓인 섹션들을 구분선으로 나눈다. */
function HubSection({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[var(--border)] pt-10">{children}</div>;
}
