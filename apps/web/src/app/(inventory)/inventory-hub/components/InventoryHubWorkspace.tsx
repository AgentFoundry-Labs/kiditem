'use client';

import { AlertTriangle, Boxes, ClipboardList, LayoutDashboard } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import { SellpiaWorkspaceFreshnessStatus } from '@/components/sellpia-inventory';
import { InventoryWorkspace } from './InventoryWorkspace';
import {
  InventoryAttentionWorkspace,
  InventoryHistoryWorkspace,
  InventoryOverviewWorkspace,
} from './InventoryOperationWorkspaces';

const INVENTORY_TABS = ['overview', 'inventory', 'attention', 'history'] as const;

export function InventoryHubWorkspace() {
  const [activeTab, setActiveTab] = useUrlControlledTab({
    key: 'tab',
    values: INVENTORY_TABS,
    defaultValue: 'overview',
  });

  return (
    <TabLayout
      title="재고 운영"
      titleIcon={Boxes}
      headerActions={<SellpiaWorkspaceFreshnessStatus />}
      activeTab={activeTab}
      onTabChange={(next) => setActiveTab(next as (typeof INVENTORY_TABS)[number])}
      unmountInactive
      tabs={[
        { id: 'overview', label: '개요', icon: LayoutDashboard, content: <InventoryOverviewWorkspace /> },
        { id: 'inventory', label: '재고', icon: Boxes, content: <InventoryWorkspace headingLevel={2} /> },
        { id: 'attention', label: '확인 필요', icon: AlertTriangle, content: <InventoryAttentionWorkspace /> },
        { id: 'history', label: '기록', icon: ClipboardList, content: <InventoryHistoryWorkspace /> },
      ]}
    />
  );
}
