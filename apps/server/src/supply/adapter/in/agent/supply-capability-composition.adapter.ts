import { Inject, Injectable } from '@nestjs/common';
import { defineCapabilityComposition } from '../../../../common/capability-composition';
import { SUPPLY_CAPABILITIES } from '../../../domain/capability/supply.capabilities';
import {
  SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT,
  type SupplyPurchaseOrderCapabilityPort,
} from '../../../application/port/in/capability/purchase-order.port';
import type { SupplyCapabilityCompositionPort } from '../../../application/port/in/capability/supply-capability-composition.port';

/** Supply owns the definition-to-procurement-owner-port Adapter. */
@Injectable()
export class SupplyCapabilityCompositionAdapter
  implements SupplyCapabilityCompositionPort
{
  readonly compositions;

  constructor(
    @Inject(SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT)
    private readonly purchaseOrders: SupplyPurchaseOrderCapabilityPort,
  ) {
    this.compositions = [
      defineCapabilityComposition(SUPPLY_CAPABILITIES[0], this.purchaseOrders, {
        capabilityKey: 'supply.create_purchase_order_draft',
        ownerInputPort: 'supply.createPurchaseOrderDraft',
        invoke: ({ context, input }) =>
          this.purchaseOrders.createPurchaseOrderDraft({
            ...input,
            organizationId: context.organizationId,
            userId: context.initiatingUserId,
            idempotencyKey: requiredOwnerIdempotencyKey(context),
            inputHash: requiredOwnerInputHash(context),
          }),
        resourceRef: (output) => ({ kind: 'purchase_order', id: output.orderId }),
      }),
      defineCapabilityComposition(SUPPLY_CAPABILITIES[1], this.purchaseOrders, {
        capabilityKey: 'supply.submit_purchase_order',
        ownerInputPort: 'supply.submitPurchaseOrder',
        invoke: ({ context, input }) =>
          this.purchaseOrders.submitPurchaseOrder({
            ...input,
            organizationId: context.organizationId,
            userId: context.initiatingUserId,
            idempotencyKey: requiredOwnerIdempotencyKey(context),
            inputHash: requiredOwnerInputHash(context),
          }),
        resourceRef: (output) => ({ kind: 'purchase_order', id: output.orderId }),
      }),
    ];
  }
}

function requiredOwnerIdempotencyKey(context: {
  ownerIdempotencyKey?: string;
}): string {
  if (!context.ownerIdempotencyKey?.trim()) {
    throw new Error('owner_idempotency_key_required');
  }
  return context.ownerIdempotencyKey;
}

function requiredOwnerInputHash(context: {
  ownerInputHash?: string;
}): string {
  if (!context.ownerInputHash?.match(/^[a-f0-9]{64}$/)) {
    throw new Error('owner_input_hash_required');
  }
  return context.ownerInputHash;
}
