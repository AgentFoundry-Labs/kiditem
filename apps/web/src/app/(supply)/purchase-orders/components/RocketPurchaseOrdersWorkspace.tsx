'use client';

import { RocketOrdersWorkspace } from '@/app/(orders)/rocket-orders/components/RocketOrdersWorkspace';
import { RocketPurchasePreviewSection } from './RocketPurchasePreviewSection';

export function RocketPurchaseOrdersWorkspace() {
  return (
    <div className="space-y-6">
      <RocketOrdersWorkspace />
      <RocketPurchasePreviewSection />
    </div>
  );
}
