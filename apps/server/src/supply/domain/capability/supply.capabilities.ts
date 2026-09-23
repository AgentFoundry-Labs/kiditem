import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(200);

export const SUPPLY_CAPABILITIES = [
  {
    key: 'supply.create_purchase_order_draft', ownerDomain: 'supply', ownerInputPort: 'supply.createPurchaseOrderDraft',
    description:
      'Create a purchase-order draft for one master product from a named supplier with unit price (CNY), MOQ and ' +
      'an optional test quantity; the result is the order id and its draft status. Use it to record a procurement ' +
      'intent for a person to approve; it never contacts the supplier, never submits, and never changes stock.',
    resultSummary: '발주 초안을 만들었습니다.',
    inputSchema: z.object({
      recommendationArtifactId: Uuid.optional(), masterProductId: Uuid, productName: z.string().trim().min(1).max(500),
      supplierName: z.string().trim().min(1).max(500), supplierId: Uuid.optional(), unitPriceCny: z.number().positive(),
      moq: z.number().int().positive(), testQuantity: z.number().int().positive().optional(),
    }).strict(),
    outputSchema: z.object({ orderId: Identifier, status: Identifier }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'supply.submit_purchase_order', ownerDomain: 'supply', ownerInputPort: 'supply.submitPurchaseOrder',
    description:
      'Submit a purchase order that a person already approved in the web app, fenced by the current collected-' +
      'inventory attempt; optional external platform, order id and URL record where it was placed. The result is ' +
      'the order id and its new status, not the supplier\'s response. It does not create or edit orders and refuses ' +
      'an order that is not approved or whose inventory attempt is stale.',
    resultSummary: '구매 발주를 제출했습니다.',
    inputSchema: z.object({
      purchaseOrderId: Uuid, inventoryAttemptId: Uuid,
      externalOrderPlatform: z.string().trim().min(1).max(40).nullable().optional(),
      externalOrderId: z.string().trim().min(1).max(100).nullable().optional(), externalOrderUrl: z.string().url().nullable().optional(),
    }).strict(),
    outputSchema: z.object({ orderId: Identifier, status: Identifier }).strict(),
    effects: ['db_write', 'external_write'], approvalRisk: 'high', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];
