'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Ban, Boxes, TrendingDown } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TabLayout from '@/components/ui/TabLayout';
import OutOfStock from './components/OutOfStock';
import ProductOutflow from './components/ProductOutflow';

const TAB_IDS = ['product-outflow', 'channel-zero'] as const;

// 재고관리(/inventory-hub)로 옮겨간 예전 분석 탭들. 대시보드·운영 알림에 남아 있는 딥링크가
// 빈 화면으로 떨어지지 않도록 새 위치로 그대로 보낸다.
const MOVED_TABS: Readonly<Record<string, string>> = {
  'sellpia-zero': '/inventory-hub?tab=checks',
  'mapping-attention': '/inventory-hub?tab=checks',
  'inventory-value': '/inventory-hub?tab=status',
  freshness: '/inventory-hub?tab=sellpia-sync',
  transfer: '/inventory-hub?tab=status',
  return: '/inventory-hub?tab=status',
  'return-transfer': '/inventory-hub?tab=status',
};

// 구성품 병목은 폐지됐다. 같은 병목 정보를 담고 있는 채널 판매 가능 0 이 대신 받는다.
const TAB_ALIASES: Readonly<Record<string, (typeof TAB_IDS)[number]>> = {
  bottlenecks: 'channel-zero',
};

export default function StockOpsPage() {
  return <Suspense fallback={<PageSkeleton variant="table" />}><StockOpsContent /></Suspense>;
}

function StockOpsContent() {
  const router = useRouter();
  const requested = useSearchParams().get('tab');
  // hasOwn 으로 조회해야 ?tab=constructor 같은 프로토타입 키가 리다이렉트 대상으로 잡히지 않는다.
  const movedTo = requested !== null && Object.hasOwn(MOVED_TABS, requested)
    ? MOVED_TABS[requested]
    : undefined;
  const resolved = requested !== null && Object.hasOwn(TAB_ALIASES, requested)
    ? TAB_ALIASES[requested]
    : requested;
  const initial = TAB_IDS.find((id) => id === resolved) ?? 'product-outflow';
  const [activeTab, setActiveTab] = useState<(typeof TAB_IDS)[number]>(initial);

  useEffect(() => {
    if (movedTo) router.replace(movedTo);
  }, [movedTo, router]);

  if (movedTo) return <PageSkeleton variant="table" />;

  return <TabLayout title="재고 분석" titleIcon={Boxes} activeTab={activeTab} onTabChange={(tabId) => setActiveTab(tabId as (typeof TAB_IDS)[number])} tabs={[
    { id: 'product-outflow', label: '상품별 소진', icon: TrendingDown, content: activeTab === 'product-outflow' ? <ProductOutflow /> : null },
    { id: 'channel-zero', label: '채널 판매 가능 0', icon: Ban, content: activeTab === 'channel-zero' ? <OutOfStock /> : null },
  ]} />;
}
