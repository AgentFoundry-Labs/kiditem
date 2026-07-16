'use client';

import { RocketOrdersWorkspace } from '@/app/(orders)/rocket-orders/components/RocketOrdersWorkspace';
import { RocketPurchasePreviewSection } from './RocketPurchasePreviewSection';

export function RocketPurchaseOrdersWorkspace() {
  return (
    <RocketOrdersWorkspace
      decisionWorkspace={<RocketPurchasePreviewSection />}
    />
  );
}
