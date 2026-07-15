'use client';

import { Package, Rocket } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { GeneralPurchaseOrdersWorkspace } from './GeneralPurchaseOrdersWorkspace';
import { RocketPurchaseOrdersWorkspace } from './RocketPurchaseOrdersWorkspace';

const PURCHASE_TABS = ['general', 'rocket'] as const;

export function PurchaseOrdersWorkspace() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useUrlControlledTab({
    key: 'tab',
    values: PURCHASE_TABS,
    defaultValue: 'general',
  });
  const orderId = searchParams.get('orderId') || undefined;
  const supplierId = searchParams.get('supplierId') || undefined;

  return (
    <TabLayout
      title="발주 운영"
      titleIcon={Package}
      headerActions={<SellpiaWorkspaceFreshnessStatus />}
      activeTab={activeTab}
      onTabChange={(next) => setActiveTab(next as (typeof PURCHASE_TABS)[number])}
      unmountInactive
      tabs={[
        {
          id: 'general',
          label: '일반 발주',
          icon: Package,
          content: (
            <GeneralPurchaseOrdersWorkspace
              orderId={orderId}
              supplierId={supplierId}
              headingLevel={2}
            />
          ),
        },
        {
          id: 'rocket',
          label: '로켓 발주',
          icon: Rocket,
          content: <RocketPurchaseOrdersWorkspace />,
        },
      ]}
    />
  );
}
