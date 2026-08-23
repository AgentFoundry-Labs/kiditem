import { defineCapabilities, type CapabilityManifest } from '../../../common/capability-manifest';

export const SUPPLY_CAPABILITIES = defineCapabilities([
  {
    key: 'supply.create_purchase_order_draft', ownerDomain: 'supply', ownerInputPort: 'supply.createPurchaseOrderDraft',
    kind: 'workflow', description: 'Create a purchase-order draft from approved evidence.',
    inputSchema: { sellpiaInventorySkuId: 'string', productName: 'string' }, outputSchema: { orderId: 'string' },
    effects: ['db_write'], approval: 'on_write', approvalRisk: 'low', idempotency: 'required', visibility: 'agent',
    entrypoint: { type: 'incoming_port', token: 'SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT' },
  },
  {
    key: 'supply.submit_purchase_order', ownerDomain: 'supply', ownerInputPort: 'supply.submitPurchaseOrder',
    kind: 'workflow', description: 'Submit an approved purchase order to its provider.',
    inputSchema: { purchaseOrderId: 'string' }, outputSchema: { orderId: 'string', status: 'string' },
    effects: ['db_write', 'external_write'], approval: 'always', approvalRisk: 'high', idempotency: 'required', visibility: 'agent',
    entrypoint: { type: 'incoming_port', token: 'SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT' },
  },
] as const satisfies readonly CapabilityManifest[]);
