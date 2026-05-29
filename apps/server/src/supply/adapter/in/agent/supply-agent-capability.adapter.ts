import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import {
  PURCHASE_ORDER_DRAFT_PORT,
  type PurchaseOrderDraftPort,
} from '../../../application/port/in/procurement/purchase-order-draft.port';

const PurchaseOrderDraftInputSchema = z.object({
  productName: z.string().min(1),
  supplierName: z.string().min(1).optional(),
  supplierId: z.string().uuid().optional(),
  unitPriceCny: z.number().positive(),
  moq: z.number().int().positive(),
  testQuantity: z.number().int().positive().optional(),
});

const PurchaseOrderDraftOutputSchema = z.object({
  orderId: z.string().min(1),
  status: z.string(),
});

function recommendationFromInput(input: Record<string, unknown>) {
  return {
    productName:
      typeof input.productName === 'string' ? input.productName : '소싱 추천 상품',
    supplierName:
      typeof input.supplierName === 'string' ? input.supplierName : '1688 supplier',
    supplierId: typeof input.supplierId === 'string' ? input.supplierId : null,
    unitPriceCny: typeof input.unitPriceCny === 'number' ? input.unitPriceCny : 22.8,
    moq: typeof input.moq === 'number' ? input.moq : 2,
    testQuantity:
      typeof input.testQuantity === 'number' ? input.testQuantity : 6,
  };
}

@Injectable()
export class SupplyAgentCapabilityAdapter implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(PURCHASE_ORDER_DRAFT_PORT)
    private readonly drafts: PurchaseOrderDraftPort,
  ) {}

  onModuleInit(): void {
    const handler: AgentCapabilityHandler = {
      key: 'supply.create_purchase_order_draft',
      ownerDomain: 'supply',
      executionKind: 'workflow',
      inputSchema: PurchaseOrderDraftInputSchema,
      outputSchema: PurchaseOrderDraftOutputSchema,
      sideEffects: ['db_write'],
      approvalRisk: 'low',
      idempotencyKey: ({ organizationId, input }) =>
        [
          organizationId,
          'supply.create_purchase_order_draft',
          String(input.productName),
          String(input.supplierName ?? input.supplierId ?? 'unknown-supplier'),
          String(input.testQuantity ?? input.moq),
        ].join(':'),
      execute: async ({ organizationId, input }) => {
        const result = await this.drafts.createFromRecommendation({
          organizationId,
          recommendation: recommendationFromInput(input),
        });
        return {
          resourceType: 'purchase_order',
          resourceId: result.orderId,
          outputSummary: { orderId: result.orderId, status: result.status },
          artifacts: [
            {
              artifactType: 'purchase_order_draft',
              targetDomain: 'supply',
              targetModel: 'PurchaseOrder',
              targetId: result.orderId,
              title: '발주 초안 생성됨',
              href: result.href,
              summary: { status: result.status, orderId: result.orderId },
            },
          ],
        };
      },
    };
    this.registry.register(handler);
  }
}
