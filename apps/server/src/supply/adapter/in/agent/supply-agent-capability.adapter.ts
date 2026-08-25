import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import {
  PURCHASE_ORDER_DRAFT_PORT,
  type PurchaseOrderDraftPort,
} from '../../../application/port/in/procurement/purchase-order-draft.port';
import {
  PURCHASE_ORDER_SUBMISSION_PORT,
  type PurchaseOrderSubmissionPort,
} from '../../../application/port/in/procurement/purchase-order-submission.port';
import type {
  SupplyPurchaseOrderCapabilityPort,
  SupplyPurchaseOrderDraftCapabilityInput,
  SupplyPurchaseOrderSubmissionCapabilityInput,
} from '../../../application/port/in/capability/purchase-order.port';

const PurchaseOrderDraftInputSchema = z.object({
  recommendationArtifactId: z.string().uuid().optional(),
  sellpiaInventorySkuId: z.string().uuid(),
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

function recommendationFromInput(input: SupplyPurchaseOrderDraftCapabilityInput) {
  const parsed = PurchaseOrderDraftInputSchema.parse(input);
  return {
    sellpiaInventorySkuId: parsed.sellpiaInventorySkuId,
    productName: parsed.productName,
    supplierName: parsed.supplierName,
    supplierId: parsed.supplierId ?? null,
    unitPriceCny: parsed.unitPriceCny,
    moq: parsed.moq,
    testQuantity: parsed.testQuantity ?? null,
  };
}

@Injectable()
export class SupplyAgentCapabilityAdapter implements SupplyPurchaseOrderCapabilityPort {
  constructor(
    @Inject(PURCHASE_ORDER_DRAFT_PORT)
    private readonly drafts: PurchaseOrderDraftPort,
    @Inject(PURCHASE_ORDER_SUBMISSION_PORT)
    private readonly submissions: PurchaseOrderSubmissionPort,
  ) {}

  async createPurchaseOrderDraft(
    input: SupplyPurchaseOrderDraftCapabilityInput,
  ): Promise<{ orderId: string; status: string }> {
    const organizationId = z.string().uuid().parse(input.organizationId);
    const idempotencyKey = z.string().min(1).parse(input.idempotencyKey);
    const requestHash = requiredInputHash(input.inputHash, draftCapabilityInput(input));
    const recommendation = recommendationFromInput(input);
    const result = await this.drafts.createFromRecommendation({
      organizationId,
      idempotencyKey,
      requestHash,
      recommendation,
    });
    return { orderId: result.orderId, status: result.status };
  }

  async submitPurchaseOrder(
    input: SupplyPurchaseOrderSubmissionCapabilityInput,
  ): Promise<{ orderId: string; status: string }> {
    const organizationId = z.string().uuid().parse(input.organizationId);
    if (typeof input.userId !== 'string' || input.userId.length === 0) {
      throw new UnauthorizedException('Purchase submission requires an authenticated actor.');
    }
    const userId = z.string().uuid().parse(input.userId);
    const idempotencyKey = z.string().min(1).parse(input.idempotencyKey);
    const requestHash = requiredInputHash(input.inputHash, submissionCapabilityInput(input));
    const parsed = PurchaseOrderSubmissionInputSchema.parse(input);
    const result = await this.submissions.submit({
      organizationId,
      purchaseOrderId: parsed.purchaseOrderId,
      idempotencyKey,
      requestHash,
      userId,
      ...(parsed.externalOrderPlatform !== undefined && { externalOrderPlatform: parsed.externalOrderPlatform }),
      ...(parsed.externalOrderId !== undefined && { externalOrderId: parsed.externalOrderId }),
      ...(parsed.externalOrderUrl !== undefined && { externalOrderUrl: parsed.externalOrderUrl }),
    });
    return { orderId: result.orderId, status: result.status };
  }
}

function draftCapabilityInput(
  input: SupplyPurchaseOrderDraftCapabilityInput,
): Record<string, unknown> {
  const {
    organizationId: _organizationId,
    userId: _userId,
    idempotencyKey: _idempotencyKey,
    inputHash: _inputHash,
    ...businessInput
  } = input;
  return businessInput;
}

function submissionCapabilityInput(
  input: SupplyPurchaseOrderSubmissionCapabilityInput,
): Record<string, unknown> {
  const {
    organizationId: _organizationId,
    userId: _userId,
    idempotencyKey: _idempotencyKey,
    inputHash: _inputHash,
    ...businessInput
  } = input;
  return businessInput;
}

function requiredInputHash(value: string, input: unknown): string {
  if (
    !/^[a-f0-9]{64}$/.test(value)
    || value !== canonicalOwnerInputHash(input)
  ) {
    throw new Error('owner_input_hash_required');
  }
  return value;
}
