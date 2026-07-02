import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  PurchaseOrderSubmissionPort,
  SubmitPurchaseOrderInput,
  SubmitPurchaseOrderResult,
} from '../port/in/procurement/purchase-order-submission.port';
import {
  PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT,
  type PurchaseOrderCheckoutRuntimePort,
  type SubmitPurchaseOrderCheckoutResult,
} from '../port/out/runtime/purchase-order-checkout-runtime.port';
import { ProcurementService } from './procurement.service';

function orderIdFromUnknown(order: unknown): string {
  if (
    order &&
    typeof order === 'object' &&
    'id' in order &&
    typeof order.id === 'string'
  ) {
    return order.id;
  }
  throw new Error('Purchase order submission result did not include id.');
}

function statusFromUnknown(order: unknown): string {
  if (
    order &&
    typeof order === 'object' &&
    'status' in order &&
    typeof order.status === 'string'
  ) {
    return order.status;
  }
  return 'ordered';
}

function optionalString(value: string | null | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

function externalPlatform(value: string | null | undefined): string {
  return optionalString(value) ?? 'ALIBABA_1688';
}

function needsCheckoutRuntime(input: SubmitPurchaseOrderInput): boolean {
  return optionalString(input.externalOrderId) === null;
}

@Injectable()
export class PurchaseOrderSubmissionService
  implements PurchaseOrderSubmissionPort
{
  constructor(
    private readonly procurement: ProcurementService,
    @Optional()
    @Inject(PURCHASE_ORDER_CHECKOUT_RUNTIME_PORT)
    private readonly checkoutRuntime?: PurchaseOrderCheckoutRuntimePort,
  ) {}

  async submit(
    input: SubmitPurchaseOrderInput,
  ): Promise<SubmitPurchaseOrderResult> {
    const checkoutIdentity = await this.checkoutIdentity(input);
    const externalOrderPlatform =
      checkoutIdentity?.externalOrderPlatform ??
      externalPlatform(input.externalOrderPlatform);
    const externalOrderId =
      checkoutIdentity?.externalOrderId ?? optionalString(input.externalOrderId);
    const externalOrderUrl =
      checkoutIdentity?.externalOrderUrl ?? optionalString(input.externalOrderUrl);
    const order = await this.procurement.submitPurchaseOrder(
      input.organizationId,
      input.purchaseOrderId,
      {
        externalOrderPlatform,
        externalOrderId,
        externalOrderUrl,
      },
    );
    const orderId = orderIdFromUnknown(order);
    return {
      orderId,
      status: statusFromUnknown(order),
      externalOrderPlatform,
      externalOrderId,
      externalOrderUrl,
      href: `/purchase-orders?orderId=${orderId}`,
    };
  }

  private async checkoutIdentity(
    input: SubmitPurchaseOrderInput,
  ): Promise<SubmitPurchaseOrderCheckoutResult | null> {
    if (!needsCheckoutRuntime(input) || !this.checkoutRuntime) {
      return null;
    }

    await this.procurement.preparePurchaseOrderSubmission(
      input.organizationId,
      input.purchaseOrderId,
    );

    return this.checkoutRuntime.submit({
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      purchaseOrder: await this.procurement.getPurchaseOrderCheckoutSnapshot(
        input.organizationId,
        input.purchaseOrderId,
      ),
    });
  }
}
