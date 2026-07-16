'use client';

import { useSearchParams } from 'next/navigation';
import { GeneralPurchaseOrdersWorkspace } from './GeneralPurchaseOrdersWorkspace';
import { RocketPurchaseOrdersWorkspace } from './RocketPurchaseOrdersWorkspace';

export function PurchaseOrdersWorkspace() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') === 'rocket' ? 'rocket' : 'general';
  const orderId = searchParams.get('orderId') || undefined;
  const supplierId = searchParams.get('supplierId') || undefined;

  if (activeTab === 'rocket') {
    return <RocketPurchaseOrdersWorkspace />;
  }

  return (
    <GeneralPurchaseOrdersWorkspace
      orderId={orderId}
      supplierId={supplierId}
      headingLevel={1}
      includeRocketPreview
    />
  );
}
