export const PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT = Symbol(
  'PURCHASE_ORDER_SUBMISSION_TRANSACTION_PORT',
);

export type PurchaseOrderSubmissionAttemptStatus =
  | 'prepared'
  | 'provider_succeeded'
  | 'provider_failed'
  | 'provider_unknown'
  | 'reconciled';

export type PurchaseOrderSubmissionAttemptState = {
  id: string;
  idempotencyKey: string;
  status: PurchaseOrderSubmissionAttemptStatus;
  createdAt?: Date;
};

export type PurchaseOrderSubmissionOrderState = {
  id: string;
  status: string;
  externalOrderPlatform: string | null;
  externalOrderId: string | null;
  externalOrderUrl: string | null;
};

export type PurchaseOrderSubmissionExternalOrder = {
  externalOrderPlatform: string | null;
  externalOrderId: string | null;
  externalOrderUrl: string | null;
};

export type PreparePurchaseOrderDraftInput = {
  organizationId: string;
  purchaseOrderId: string;
  userId: string;
  idempotencyKey: string;
};

export type DeletePurchaseOrderInput = {
  organizationId: string;
  purchaseOrderId: string;
};

export type DeletePurchaseOrderResult =
  | { kind: 'deleted'; order: { id: string; status: string } }
  | { kind: 'not_found' }
  | { kind: 'not_deletable' }
  | { kind: 'unresolved_attempt' };

export type PreparePurchaseOrderSubmissionInput = {
  organizationId: string;
  purchaseOrderId: string;
  masterProductIds: string[];
  idempotencyKey: string;
  userId: string;
  freshnessFence: string;
  freshnessLastVerifiedAt: string;
  freshnessExpiresAt: string;
  requiresProvider: boolean;
  externalOrder: PurchaseOrderSubmissionExternalOrder;
};

export type PreparePurchaseOrderSubmissionResult =
  | {
      kind: 'providerless';
      order: PurchaseOrderSubmissionOrderState;
    }
  | {
      kind: 'created' | 'existing';
      attempt: PurchaseOrderSubmissionAttemptState;
      order: PurchaseOrderSubmissionOrderState;
    };

export type PurchaseOrderSubmissionAttemptCommand = {
  organizationId: string;
  purchaseOrderId: string;
  attemptId: string;
  idempotencyKey: string;
};

export type CompletePurchaseOrderProviderSuccessInput =
  PurchaseOrderSubmissionAttemptCommand & {
    provider: PurchaseOrderSubmissionExternalOrder & {
      externalOrderPlatform: string;
      externalOrderId: string;
    };
  };

export type CompletePurchaseOrderProviderFailureInput =
  PurchaseOrderSubmissionAttemptCommand & {
    errorCode: string;
    errorMessage: string;
  };

export type ReconcilePurchaseOrderSubmissionTransactionInput = {
  organizationId: string;
  purchaseOrderId: string;
  userId: string;
  outcome: 'provider_succeeded' | 'provider_failed';
  providerReference?: string | null;
};

export interface PurchaseOrderSubmissionTransactionPort {
  prepareDraft(
    input: PreparePurchaseOrderDraftInput,
  ): Promise<{ id: string; status: string }>;
  deletePurchaseOrder(
    input: DeletePurchaseOrderInput,
  ): Promise<DeletePurchaseOrderResult>;
  prepare(
    input: PreparePurchaseOrderSubmissionInput,
  ): Promise<PreparePurchaseOrderSubmissionResult>;
  completeProviderSuccess(
    input: CompletePurchaseOrderProviderSuccessInput,
  ): Promise<PurchaseOrderSubmissionOrderState>;
  completeProviderFailure(
    input: CompletePurchaseOrderProviderFailureInput,
  ): Promise<void>;
  markProviderUnknown(
    input: CompletePurchaseOrderProviderFailureInput,
  ): Promise<void>;
  reconcile(
    input: ReconcilePurchaseOrderSubmissionTransactionInput,
  ): Promise<PurchaseOrderSubmissionOrderState>;
}
