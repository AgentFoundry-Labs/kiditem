import { AppException } from '@kiditem/shared/server-errors';
import { ErrorCodes } from '@kiditem/shared/errors';
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  SELLPIA_INVENTORY_FRESHNESS_GATE_PORT,
  type SellpiaInventoryFreshnessGatePort,
} from '../../../inventory/application/port/in/stock/sellpia-inventory-freshness-gate.port';
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
    @Inject(SELLPIA_INVENTORY_FRESHNESS_GATE_PORT)
    private readonly freshness: SellpiaInventoryFreshnessGatePort,
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
      ...new Set(purchaseOrder.items.map((item) => item.masterProductId)),
    ];
    const gate = await this.freshness.assertFreshAndActive({
      organizationId: input.organizationId,
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
      idempotencyKey,
      userId: input.userId,
      freshnessFence: gate.fence,
      freshnessLastVerifiedAt: gate.lastVerifiedAt,
      freshnessExpiresAt: gate.expiresAt,
      requiresProvider,
      externalOrder,
    });

    if (prepared.kind === 'providerless') return toResult(prepared.order);
    if (prepared.kind === 'existing') throw reconciliationRequired();
    if (!this.checkoutRuntime) {
      throw new Error('Prepared provider submission has no checkout runtime.');
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
        throw error;
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
    throw new BadRequestException(
      'Purchase submission idempotency key is required.',
    );
  }
  return key;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'External purchase provider response was ambiguous.';
}

function reconciliationRequired(): AppException {
  return new AppException(
    409,
    ErrorCodes.PURCHASE.SUBMISSION_RECONCILIATION_REQUIRED,
    'The existing external purchase attempt must be reconciled before another submission.',
  );
}
