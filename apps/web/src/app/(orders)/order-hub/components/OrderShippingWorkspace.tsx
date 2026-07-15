'use client';

import DeliverySearch from '../../order-status-hub/components/DeliverySearch';
import { OutboundWorkspace } from './OutboundWorkspace';

export function OrderShippingWorkspace() {
  return (
    <div className="space-y-8">
      <OutboundWorkspace />
      <DeliverySearch />
    </div>
  );
}
