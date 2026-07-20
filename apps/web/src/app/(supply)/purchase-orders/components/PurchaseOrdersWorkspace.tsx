'use client';

import { useSearchParams } from 'next/navigation';
import { GeneralPurchaseOrdersWorkspace } from './GeneralPurchaseOrdersWorkspace';

export function PurchaseOrdersWorkspace() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId') || undefined;
  const supplierId = searchParams.get('supplierId') || undefined;

  return (
    <GeneralPurchaseOrdersWorkspace
      orderId={orderId}
      supplierId={supplierId}
      headingLevel={1}
    />
  );
}
