'use client';

import Link from 'next/link';
import { ArrowLeftRight, CircleDollarSign, RotateCcw } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import DeadStock from '../../stock-ops/components/DeadStock';
import ImportFreshness from '../../stock-ops/components/ImportFreshness';
import MappingAttention from '../../stock-ops/components/MappingAttention';
import OutOfStock from '../../stock-ops/components/OutOfStock';
import ReturnTransfers from '../../stock-ops/components/ReturnTransfers';
import StockRetention from '../../stock-ops/components/StockRetention';
import StockTransfers from '../../stock-ops/components/StockTransfers';
import ZeroItems from '../../stock-ops/components/ZeroItems';
import ChannelAvailability from './ChannelAvailability';
import StockAssets from './StockAssets';

const HISTORY_VIEWS = ['assets', 'transfer', 'return'] as const;

export function InventoryOverviewWorkspace() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ImportFreshness />
      <StockRetention />
    </div>
  );
}

export function InventoryAttentionWorkspace() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          품절·구성품 병목·비활성 구성품 경고를 확인한 뒤 채널 SKU 구성을 검토하세요.
        </p>
        <Link
          href="/product-hub/matching?status=needs_review"
          className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white"
        >
          매칭 확인 필요 SKU 검토
        </Link>
      </div>
      <ZeroItems />
      <OutOfStock />
      <DeadStock />
      <MappingAttention />
      <ChannelAvailability />
    </div>
  );
}

export function InventoryHistoryWorkspace() {
  const [view, setView] = useUrlControlledTab({
    key: 'view',
    values: HISTORY_VIEWS,
    defaultValue: 'assets',
  });

  return (
    <TabLayout
      title="재고 기록"
      headingLevel={2}
      activeTab={view}
      onTabChange={(next) => setView(next as (typeof HISTORY_VIEWS)[number])}
      unmountInactive
      tabs={[
        { id: 'assets', label: '재고자산', icon: CircleDollarSign, content: <StockAssets /> },
        { id: 'transfer', label: '창고 이관', icon: ArrowLeftRight, content: <StockTransfers /> },
        { id: 'return', label: '반품 기록', icon: RotateCcw, content: <ReturnTransfers /> },
      ]}
    />
  );
}
