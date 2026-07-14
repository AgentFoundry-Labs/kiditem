import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AgentCapabilityRegistry } from '../../../../agent-os/application/service/agent-capability-registry.service';
import {
  PURCHASE_ORDER_DRAFT_PORT,
  type PurchaseOrderDraftPort,
} from '../../../application/port/in/procurement/purchase-order-draft.port';
import {
  PURCHASE_ORDER_SUBMISSION_PORT,
  type PurchaseOrderSubmissionPort,
} from '../../../application/port/in/procurement/purchase-order-submission.port';
import type { AgentCapabilityHandler } from '../../../../agent-os/application/port/out/capability/agent-capability-handler.port';

const PurchaseOrderDraftInputSchema = z.object({
  recommendationArtifactId: z.string().uuid().optional(),
  masterProductId: z.string().uuid(),
  productName: z.string().min(1),
  supplierName: z.string().min(1),
  supplierId: z.string().uuid().optional(),
  unitPriceCny: z.number().positive(),
  moq: z.number().int().positive(),
  testQuantity: z.number().int().positive().optional(),
});

const PurchaseOrderDraftOutputSchema = z.object({
  orderId: z.string().min(1),
  status: z.string(),
});

const PurchaseOrderSubmissionInputSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  externalOrderPlatform: z.string().trim().min(1).max(40).nullable().optional(),
  externalOrderId: z.string().trim().min(1).max(100).nullable().optional(),
  externalOrderUrl: z.string().trim().url().nullable().optional(),
});

const PurchaseOrderSubmissionOutputSchema = z.object({
  orderId: z.string().min(1),
  status: z.string(),
  externalOrderPlatform: z.string().nullable(),
  externalOrderId: z.string().nullable(),
  externalOrderUrl: z.string().nullable(),
});

function recommendationFromInput(input: Record<string, unknown>) {
  const parsed = PurchaseOrderDraftInputSchema.parse(input);
  return {
    masterProductId: parsed.masterProductId,
    productName: parsed.productName,
    supplierName: parsed.supplierName,
    supplierId: parsed.supplierId ?? null,
    unitPriceCny: parsed.unitPriceCny,
    moq: parsed.moq,
    testQuantity: parsed.testQuantity ?? null,
  };
}

function purchaseOrderDraftIdempotencyKey(input: {
  organizationId: string;
  requestId?: string | null;
  input: Record<string, unknown>;
}): string {
  const source =
    typeof input.input.recommendationArtifactId === 'string'
      ? `recommendation_artifact:${input.input.recommendationArtifactId}`
      : input.requestId
        ? `request:${input.requestId}`
        : [
            'content',
            String(input.input.productName),
            String(input.input.supplierName ?? input.input.supplierId ?? 'unknown-supplier'),
            String(input.input.testQuantity ?? input.input.moq),
          ].join(':');

  return [input.organizationId, 'supply.create_purchase_order_draft', source].join(
    ':',
  );
}

@Injectable()
export class SupplyAgentCapabilityAdapter implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(PURCHASE_ORDER_DRAFT_PORT)
    private readonly drafts: PurchaseOrderDraftPort,
    @Inject(PURCHASE_ORDER_SUBMISSION_PORT)
    private readonly submissions: PurchaseOrderSubmissionPort,
  ) {}

  onModuleInit(): void {
    const draftHandler: AgentCapabilityHandler = {
      key: 'supply.create_purchase_order_draft',
      ownerDomain: 'supply',
      executionKind: 'workflow',
      inputSchema: PurchaseOrderDraftInputSchema,
      outputSchema: PurchaseOrderDraftOutputSchema,
      sideEffects: ['db_write'],
      approvalRisk: 'low',
      idempotencyKey: purchaseOrderDraftIdempotencyKey,
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
    const submitHandler: AgentCapabilityHandler = {
      key: 'supply.submit_purchase_order',
      ownerDomain: 'supply',
      executionKind: 'workflow',
      inputSchema: PurchaseOrderSubmissionInputSchema,
      outputSchema: PurchaseOrderSubmissionOutputSchema,
      sideEffects: ['external_write', 'db_write'],
      approvalRisk: 'high',
      idempotencyKey: ({ organizationId, input }) =>
        [
          organizationId,
          'supply.submit_purchase_order',
          String(input.purchaseOrderId),
        ].join(':'),
      execute: async ({ organizationId, input }) => {
        const parsed = PurchaseOrderSubmissionInputSchema.parse(input);
        const result = await this.submissions.submit({
          organizationId,
          purchaseOrderId: parsed.purchaseOrderId,
          externalOrderPlatform: parsed.externalOrderPlatform,
          externalOrderId: parsed.externalOrderId,
          externalOrderUrl: parsed.externalOrderUrl,
        });
        const externalOrderPlatform =
          result.externalOrderPlatform ?? 'ALIBABA_1688';
        const outputSummary = {
          orderId: result.orderId,
          status: result.status,
          externalOrderPlatform,
          externalOrderId: result.externalOrderId,
          externalOrderUrl: result.externalOrderUrl,
        };
        return {
          resourceType: 'purchase_order',
          resourceId: result.orderId,
          outputSummary,
          artifacts: [
            {
              artifactType: 'purchase_order_submission',
              targetDomain: 'supply',
              targetModel: 'PurchaseOrder',
              targetId: result.orderId,
              title: '발주 제출 완료',
              href: result.href,
              summary: outputSummary,
            },
          ],
        };
      },
    };
    this.registry.register(draftHandler);
    this.registry.register(submitHandler);
  }
}
