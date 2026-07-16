import { RocketPurchasePreviewSection } from '@/app/(supply)/purchase-orders/components/RocketPurchasePreviewSection';
import { RocketOrdersWorkspace } from './components/RocketOrdersWorkspace';

export default function RocketOrdersPage() {
  return (
    <RocketOrdersWorkspace
      decisionWorkspace={<RocketPurchasePreviewSection />}
    />
  );
}
