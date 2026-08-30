import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(200);

export const SUPPLY_CAPABILITIES = [
  {
    key: 'supply.create_purchase_order_draft', ownerDomain: 'supply', ownerInputPort: 'supply.createPurchaseOrderDraft',
    description: 'Create an organization-scoped purchase-order draft from validated procurement inputs.',
    resultSummary: '발주 초안을 만들었습니다.',
    inputSchema: z.object({
      recommendationArtifactId: Uuid.optional(), sellpiaInventorySkuId: Uuid, productName: z.string().trim().min(1).max(500),
      supplierName: z.string().trim().min(1).max(500), supplierId: Uuid.optional(), unitPriceCny: z.number().positive(),
      moq: z.number().int().positive(), testQuantity: z.number().int().positive().optional(),
    }).strict(),
    outputSchema: z.object({ orderId: Identifier, status: Identifier }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'supply.submit_purchase_order', ownerDomain: 'supply', ownerInputPort: 'supply.submitPurchaseOrder',
    description: 'Submit an approved purchase order through the Supply owner.',
    resultSummary: '구매 발주를 제출했습니다.',
    inputSchema: z.object({
      purchaseOrderId: Uuid, externalOrderPlatform: z.string().trim().min(1).max(40).nullable().optional(),
      externalOrderId: z.string().trim().min(1).max(100).nullable().optional(), externalOrderUrl: z.string().url().nullable().optional(),
    }).strict(),
    outputSchema: z.object({ orderId: Identifier, status: Identifier }).strict(),
    effects: ['db_write', 'external_write'], approvalRisk: 'high', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];
