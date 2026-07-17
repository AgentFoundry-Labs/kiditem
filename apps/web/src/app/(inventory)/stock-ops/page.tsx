'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeftRight, Ban, Boxes, CircleDollarSign, Clock3, Gauge, Link2Off, PackageX, RotateCcw } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';
import DeadStock from './components/DeadStock';
import ImportFreshness from './components/ImportFreshness';
import MappingAttention from './components/MappingAttention';
import OutOfStock from './components/OutOfStock';
import ReturnTransfers from './components/ReturnTransfers';
import StockRetention from './components/StockRetention';
import StockTransfers from './components/StockTransfers';
import ZeroItems from './components/ZeroItems';

const TAB_IDS = ['sellpia-zero', 'channel-zero', 'bottlenecks', 'mapping-attention', 'inventory-value', 'freshness', 'transfer', 'return-transfer'] as const;

export default function StockOpsPage() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><StockOpsContent /></Suspense>;
}

function StockOpsContent() {
  const requested = useSearchParams().get('tab');
  const initial = TAB_IDS.find((id) => id === requested) ?? 'sellpia-zero';
  const [activeTab, setActiveTab] = useState(initial);

  return <TabLayout title="재고 분석" titleIcon={Boxes} activeTab={activeTab} onTabChange={(tabId) => setActiveTab(tabId as (typeof TAB_IDS)[number])} tabs={[
    { id: 'sellpia-zero', label: 'Sellpia 재고 0', icon: PackageX, content: activeTab === 'sellpia-zero' ? <ZeroItems /> : null },
    { id: 'channel-zero', label: '채널 판매 가능 0', icon: Ban, content: activeTab === 'channel-zero' ? <OutOfStock /> : null },
    { id: 'bottlenecks', label: '구성품 병목', icon: Gauge, content: activeTab === 'bottlenecks' ? <DeadStock /> : null },
    { id: 'mapping-attention', label: '매핑 확인', icon: Link2Off, content: activeTab === 'mapping-attention' ? <MappingAttention /> : null },
    { id: 'inventory-value', label: '재고자산', icon: CircleDollarSign, content: activeTab === 'inventory-value' ? <StockRetention /> : null },
    { id: 'freshness', label: '가져오기 상태', icon: Clock3, content: activeTab === 'freshness' ? <ImportFreshness /> : null },
    { id: 'transfer', label: '창고 이관 기록', icon: ArrowLeftRight, content: activeTab === 'transfer' ? <StockTransfers /> : null },
    { id: 'return-transfer', label: '반품 기록', icon: RotateCcw, content: activeTab === 'return-transfer' ? <ReturnTransfers /> : null },
  ]} />;
}
