import { KiditemError, KiditemExternalError, KiditemInvalidValueError, KiditemPreconditionError } from '@kiditem/shared/errors';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
import {
  PRODUCT_COLLECTION_FRESHNESS_GATE_PORT,
  type ProductCollectionFreshnessGatePort,
} from '../../../products/application/port/in/product-collection-freshness-gate.port';
import type {
  PurchaseOrderSubmissionPort,
  ReconcilePurchaseOrderSubmissionInput,
  SubmitPurchaseOrderInput,
  SubmitPurchaseOrderResult,
} from '../port/in/procurement/purchase-order-submission.port';
import {
  PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT,
  PurchaseOrderCheckoutProviderFailedError,
  PurchaseOrderCheckoutProviderUnknownError,
  type PurchaseOrderCheckoutRuntimePort,
} from '../port/out/runtime/purchase-order-checkout-runtime.port';
import {
  PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT,
  type PurchaseOrderSubmissionOrderState,
  type PurchaseOrderSubmissionTransactionPort,
} from '../port/out/transaction/purchase-order-submission.transaction.port';
import { ProcurementService } from './procurement.service';

@Injectable()
export class PurchaseOrderSubmissionService
implements PurchaseOrderSubmissionPort {
  constructor(
    private readonly procurement: ProcurementService,
    @Inject(PRODUCT_COLLECTION_FRESHNESS_GATE_PORT)
    private readonly freshness: ProductCollectionFreshnessGatePort,
    @Inject(PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT)
    private readonly transaction: PurchaseOrderSubmissionTransactionPort,
    @Optional()
    @Inject(PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT)
    private readonly checkoutRuntime?: PurchaseOrderCheckoutRuntimePort,
  ) {}

  async submit(
    input: SubmitPurchaseOrderInput,
  ): Promise<SubmitPurchaseOrderResult> {
    const idempotencyKey = cleanKey(input.idempotencyKey);
    const requestHash = requiredCanonicalRequestHash(input);
    await this.transaction.prepareDraft({
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      userId: input.userId,
      idempotencyKey,
    });
    const purchaseOrder = await this.procurement.getPurchaseOrderCheckoutSnapshot(
      input.organizationId,
      input.purchaseOrderId,
    );
    const masterProductIds = [
      ...new Set(purchaseOrder.items.flatMap((item) => (
        item.masterProductId ? [item.masterProductId] : []
      ))),
    ];
    if (masterProductIds.length !== purchaseOrder.items.length) {
      throw new KiditemPreconditionError('SUPPLY_PURCHASE_LEGACY_ORDER');
    }
    const gate = await this.freshness.requireCollectedStock({
      organizationId: input.organizationId,
      operationId: input.inventoryOperationId,
      masterProductIds,
    });
    const externalOrder = {
      externalOrderPlatform: optionalString(input.externalOrderPlatform),
      externalOrderId: optionalString(input.externalOrderId),
      externalOrderUrl: optionalString(input.externalOrderUrl),
    };
    if (externalOrder.externalOrderId && !externalOrder.externalOrderPlatform) {
      externalOrder.externalOrderPlatform = 'ALIBABA_1688';
    }
    const requiresProvider =
      externalOrder.externalOrderId === null && Boolean(this.checkoutRuntime);
    const prepared = await this.transaction.prepare({
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      masterProductIds,
      inventoryOperationId: gate.operationId,
      inventoryFence: gate.fence,
      inventoryGeneration: gate.generation,
      inventoryCompletedAt: gate.completedAt,
      idempotencyKey,
      requestHash,
      userId: input.userId,
      requiresProvider,
      externalOrder,
    });

    if (prepared.kind === 'providerless') return toResult(prepared.order);
    if (prepared.kind === 'existing') throw reconciliationRequired();
    if (!this.checkoutRuntime) {
      throw new KiditemError('INTERNAL_ERROR', { details: { reason: 'CHECKOUT_RUNTIME_MISSING' } });
    }

    try {
      const provider = await this.checkoutRuntime.submit({
        organizationId: input.organizationId,
        purchaseOrderId: input.purchaseOrderId,
        idempotencyKey,
        purchaseOrder,
      });
      const order = await this.transaction.completeProviderSuccess({
        organizationId: input.organizationId,
        purchaseOrderId: input.purchaseOrderId,
        attemptId: prepared.attempt.id,
        idempotencyKey,
        provider,
      });
      return toResult(order);
    } catch (error) {
      const message = errorMessage(error);
      if (error instanceof PurchaseOrderCheckoutProviderFailedError) {
        await this.transaction.completeProviderFailure({
          organizationId: input.organizationId,
          purchaseOrderId: input.purchaseOrderId,
          attemptId: prepared.attempt.id,
          idempotencyKey,
          errorCode: error.code,
          errorMessage: message,
        });
        throw new KiditemExternalError('SUPPLY_PURCHASE_PROVIDER_FAILED', { details: { reason: error.code }, cause: error });
      }

      await this.transaction.markProviderUnknown({
        organizationId: input.organizationId,
        purchaseOrderId: input.purchaseOrderId,
        attemptId: prepared.attempt.id,
        idempotencyKey,
        errorCode: error instanceof PurchaseOrderCheckoutProviderUnknownError
          ? error.code
          : 'provider_response_unknown',
        errorMessage: message,
      });
      throw reconciliationRequired();
    }
  }

  async reconcile(
    input: ReconcilePurchaseOrderSubmissionInput,
  ): Promise<SubmitPurchaseOrderResult> {
    return toResult(await this.transaction.reconcile({
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      userId: input.userId,
      outcome: input.outcome,
      providerReference: optionalString(input.providerReference),
    }));
  }
}

function toResult(order: PurchaseOrderSubmissionOrderState): SubmitPurchaseOrderResult {
  return {
    orderId: order.id,
    status: order.status,
    externalOrderPlatform: order.externalOrderPlatform,
    externalOrderId: order.externalOrderId,
    externalOrderUrl: order.externalOrderUrl,
    href: `/purchase-orders?orderId=${order.id}`,
  };
}

function optionalString(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function cleanKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'IDEMPOTENCY_KEY_REQUIRED' } });
  }
  return key;
}

function requiredCanonicalRequestHash(input: SubmitPurchaseOrderInput): string {
  const businessInput = {
    purchaseOrderId: input.purchaseOrderId,
    inventoryOperationId: input.inventoryOperationId,
    ...(input.externalOrderPlatform !== undefined && {
      externalOrderPlatform: input.externalOrderPlatform,
    }),
    ...(input.externalOrderId !== undefined && {
      externalOrderId: input.externalOrderId,
    }),
    ...(input.externalOrderUrl !== undefined && {
      externalOrderUrl: input.externalOrderUrl,
    }),
  };
  if (
    !/^[a-f0-9]{64}$/.test(input.requestHash)
    || input.requestHash !== canonicalOwnerInputHash(businessInput)
  ) {
    throw new KiditemInvalidValueError('VALIDATION_FAILED', { details: { reason: 'INPUT_HASH_REQUIRED' } });
  }
  return input.requestHash;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'External purchase provider response was ambiguous.';
}

function reconciliationRequired(): KiditemError {
  return new KiditemPreconditionError('SUPPLY_SUBMISSION_RECONCILIATION_REQUIRED');
}
