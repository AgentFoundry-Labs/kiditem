export const PURCHASE_ORDER_SUBMISSION_PORT = Symbol(
  'PURCHASE_ORDER_SUBMISSION_PORT',
);

export interface SubmitPurchaseOrderInput {
  organizationId: string;
  purchaseOrderId: string;
  idempotencyKey: string;
  userId: string;
  externalOrderPlatform?: string | null;
  externalOrderId?: string | null;
  externalOrderUrl?: string | null;
}

export type ReconcilePurchaseOrderSubmissionInput = {
  organizationId: string;
  purchaseOrderId: string;
  userId: string;
  outcome: 'provider_succeeded' | 'provider_failed';
  providerReference?: string | null;
};

export interface SubmitPurchaseOrderResult {
  orderId: string;
  status: string;
  externalOrderPlatform: string | null;
  externalOrderId: string | null;
  externalOrderUrl: string | null;
  href: string;
}

export interface PurchaseOrderSubmissionPort {
  submit(input: SubmitPurchaseOrderInput): Promise<SubmitPurchaseOrderResult>;
  reconcile(
    input: ReconcilePurchaseOrderSubmissionInput,
  ): Promise<SubmitPurchaseOrderResult>;
}
