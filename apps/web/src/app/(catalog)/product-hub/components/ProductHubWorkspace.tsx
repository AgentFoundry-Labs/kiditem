'use client';

import { Layers, Package } from 'lucide-react';
import TabLayout from '@/components/ui/TabLayout';
import { useUrlControlledTab } from '@/hooks/useUrlControlledTab';
import ProductsPageContent from './ProductsPageContent';
import { ProductOptionsWorkspace } from './ProductOptionsWorkspace';

const PRODUCT_VIEWS = ['list', 'options'] as const;

export function ProductHubWorkspace() {
  const [view, setView] = useUrlControlledTab({
    key: 'view',
    values: PRODUCT_VIEWS,
    defaultValue: 'list',
  });

  return (
    <TabLayout
      title="상품 운영"
      titleIcon={Package}
      activeTab={view}
      onTabChange={(next) => setView(next as (typeof PRODUCT_VIEWS)[number])}
      unmountInactive
      tabs={[
        { id: 'list', label: '상품 목록', icon: Package, content: <ProductsPageContent /> },
        { id: 'options', label: '상품 옵션', icon: Layers, content: <ProductOptionsWorkspace /> },
      ]}
    />
  );
}
