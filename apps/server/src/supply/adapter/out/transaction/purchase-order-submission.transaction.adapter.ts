import { AppException } from '@kiditem/shared/server-errors';
import { ErrorCodes } from '@kiditem/shared/errors';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CompletePurchaseOrderProviderFailureInput,
  CompletePurchaseOrderProviderSuccessInput,
  DeletePurchaseOrderInput,
  DeletePurchaseOrderResult,
  PreparePurchaseOrderDraftInput,
  PreparePurchaseOrderSubmissionInput,
  PreparePurchaseOrderSubmissionResult,
  PurchaseOrderSubmissionAttemptState,
  PurchaseOrderSubmissionOrderState,
  PurchaseOrderSubmissionTransactionPort,
  ReconcilePurchaseOrderSubmissionTransactionInput,
} from '../../../application/port/out/transaction/purchase-order-submission.transaction.port';
import { isDeletablePurchaseOrderStatus } from '../../../domain/policy/purchase-order-status';

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;
const PREPARED_RECONCILIATION_MS = 15 * 60_000;

type LockedFreshnessRow = {
  freshnessFence: string;
  freshnessGeneration: bigint;
  lastVerifiedAt: Date | null;
  databaseNow: Date;
};

type LockedOrderRow = { id: string; status: string };

type LockedAttemptRow = {
  id: string;
  idempotencyKey: string;
  status: string;
  providerReference: string | null;
  reconciliationOutcome: string | null;
  createdAt: Date;
};

type ReconciliationLockedAttemptRow = LockedAttemptRow & {
  databaseNow: Date;
};

@Injectable()
export class PurchaseOrderSubmissionTransactionAdapter
implements PurchaseOrderSubmissionTransactionPort {
  constructor(private readonly prisma: PrismaService) {}

  prepareDraft(
    input: PreparePurchaseOrderDraftInput,
  ): Promise<{ id: string; status: string }> {
    return this.prisma.$transaction(async (tx) => {
      assertNormalizedIdempotencyKey(input.idempotencyKey);
      const order = await lockOrder(tx, input.organizationId, input.purchaseOrderId);
      if (!order) throw referenceInvalid();
      await assertActor(tx, input.organizationId, input.userId);

      if (order.status === 'pending' || order.status === 'ordered') return order;
      if (order.status !== 'draft') {
        throw new BadRequestException(
          'Only draft or pending purchase orders may be submitted.',
        );
      }

      const updated = await tx.purchaseOrder.updateMany({
        where: {
          id: input.purchaseOrderId,
          organizationId: input.organizationId,
          status: 'draft',
        },
        data: { status: 'pending' },
      });
      if (updated.count !== 1) throw referenceInvalid();
      return { id: order.id, status: 'pending' };
    }, TRANSACTION_OPTIONS);
  }

  deletePurchaseOrder(
    input: DeletePurchaseOrderInput,
  ): Promise<DeletePurchaseOrderResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, input.organizationId, input.purchaseOrderId);
      if (!order) return { kind: 'not_found' as const };
      if (!isDeletablePurchaseOrderStatus(order.status)) {
        return { kind: 'not_deletable' as const };
      }

      const unresolvedAttempts = await tx.purchaseOrderSubmissionAttempt.count({
        where: {
          organizationId: input.organizationId,
          purchaseOrderId: input.purchaseOrderId,
          status: {
            in: [
              'prepared',
              'provider_succeeded',
              'provider_failed',
              'provider_unknown',
            ],
          },
        },
      });
      if (unresolvedAttempts > 0) return { kind: 'unresolved_attempt' as const };

      const deleted = await tx.purchaseOrder.deleteMany({
        where: {
          id: input.purchaseOrderId,
          organizationId: input.organizationId,
          status: order.status,
        },
      });
      if (deleted.count !== 1) return { kind: 'not_found' as const };
      return {
        kind: 'deleted' as const,
        order: { id: order.id, status: order.status },
      };
    }, TRANSACTION_OPTIONS);
  }

  prepare(
    input: PreparePurchaseOrderSubmissionInput,
  ): Promise<PreparePurchaseOrderSubmissionResult> {
    return this.prisma.$transaction(async (tx) => {
      assertNormalizedIdempotencyKey(input.idempotencyKey);
      const freshness = await lockFreshness(tx, input.organizationId);
      const order = await lockOrder(tx, input.organizationId, input.purchaseOrderId);
      if (!order) throw referenceInvalid();
      await assertActor(tx, input.organizationId, input.userId);
      assertFreshness(freshness, input);
      await assertPurchaseItems(tx, input);

      if (order.status === 'ordered') {
        return {
          kind: 'providerless' as const,
          order: await findOrder(tx, input.organizationId, input.purchaseOrderId),
        };
      }
      if (order.status !== 'pending') {
        throw new BadRequestException('Only pending purchase orders may be submitted.');
      }

      if (!input.requiresProvider) {
        const updated = await tx.purchaseOrder.updateMany({
          where: {
            id: input.purchaseOrderId,
            organizationId: input.organizationId,
            status: 'pending',
          },
          data: {
            status: 'ordered',
            ...input.externalOrder,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('Purchase order status changed during submission.');
        }
        return {
          kind: 'providerless' as const,
          order: await findOrder(tx, input.organizationId, input.purchaseOrderId),
        };
      }

      const latest = await tx.purchaseOrderSubmissionAttempt.findFirst({
        where: {
          organizationId: input.organizationId,
          purchaseOrderId: input.purchaseOrderId,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          idempotencyKey: true,
          status: true,
          providerReference: true,
          reconciliationOutcome: true,
          createdAt: true,
        },
      });
      if (latest) {
        const promoted = await promoteExpiredPrepared(
          tx,
          input,
          freshness.databaseNow,
          latest,
        );
        const mayStartAfterReconciledFailure =
          promoted.status === 'reconciled'
          && promoted.reconciliationOutcome === 'provider_failed'
          && promoted.idempotencyKey !== input.idempotencyKey;
        if (!mayStartAfterReconciledFailure) {
          return {
            kind: 'existing' as const,
            attempt: toAttemptState(promoted),
            order: await findOrder(tx, input.organizationId, input.purchaseOrderId),
          };
        }
      }

      const attempt = await tx.purchaseOrderSubmissionAttempt.create({
        data: {
          organizationId: input.organizationId,
          purchaseOrderId: input.purchaseOrderId,
          idempotencyKey: input.idempotencyKey,
          freshnessGeneration: freshness.freshnessGeneration,
          status: 'prepared',
        },
      });
      return {
        kind: 'created' as const,
        attempt: toAttemptState(attempt),
        order: await findOrder(tx, input.organizationId, input.purchaseOrderId),
      };
    }, TRANSACTION_OPTIONS);
  }

  completeProviderSuccess(
    input: CompletePurchaseOrderProviderSuccessInput,
  ): Promise<PurchaseOrderSubmissionOrderState> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, input.organizationId, input.purchaseOrderId);
      const attempt = await lockAttempt(tx, input);
      if (!attempt || attempt.status !== 'prepared') throw reconciliationRequired();

      const terminal = await tx.purchaseOrderSubmissionAttempt.updateMany({
        where: attemptWhere(input, 'prepared'),
        data: {
          status: 'provider_succeeded',
          providerReference: input.provider.externalOrderId,
          errorCode: null,
          errorMessage: null,
        },
      });
      if (terminal.count !== 1) throw reconciliationRequired();

      const ordered = await tx.purchaseOrder.updateMany({
        where: {
          id: input.purchaseOrderId,
          organizationId: input.organizationId,
          status: 'pending',
        },
        data: { status: 'ordered', ...input.provider },
      });
      if (ordered.count !== 1) throw reconciliationRequired();
      return findOrder(tx, input.organizationId, input.purchaseOrderId);
    }, TRANSACTION_OPTIONS);
  }

  completeProviderFailure(
    input: CompletePurchaseOrderProviderFailureInput,
  ): Promise<void> {
    return this.completeAttempt(input, 'provider_failed');
  }

  markProviderUnknown(
    input: CompletePurchaseOrderProviderFailureInput,
  ): Promise<void> {
    return this.completeAttempt(input, 'provider_unknown');
  }

  reconcile(
    input: ReconcilePurchaseOrderSubmissionTransactionInput,
  ): Promise<PurchaseOrderSubmissionOrderState> {
    return this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, input.organizationId, input.purchaseOrderId);
      if (!order) throw referenceInvalid();
      await assertActor(tx, input.organizationId, input.userId);
      const attempts = await tx.$queryRaw<ReconciliationLockedAttemptRow[]>`
        SELECT
          id,
          idempotency_key AS "idempotencyKey",
          status,
          provider_reference AS "providerReference",
          reconciliation_outcome AS "reconciliationOutcome",
          created_at AS "createdAt",
          CURRENT_TIMESTAMP AS "databaseNow"
        FROM purchase_order_submission_attempts
        WHERE organization_id = ${input.organizationId}::uuid
          AND purchase_order_id = ${input.purchaseOrderId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `;
      const lockedAttempt = attempts[0];
      if (!lockedAttempt) throw reconciliationRequired();
      const attempt = await promoteExpiredPrepared(
        tx,
        input,
        lockedAttempt.databaseNow,
        lockedAttempt,
      );
      if (attempt.status !== 'provider_unknown' && attempt.status !== 'provider_failed') {
        throw reconciliationRequired();
      }

      const providerReference = cleanOptional(input.providerReference)
        ?? attempt.providerReference;
      const reconciled = await tx.purchaseOrderSubmissionAttempt.updateMany({
        where: {
          id: attempt.id,
          organizationId: input.organizationId,
          purchaseOrderId: input.purchaseOrderId,
          status: attempt.status,
        },
        data: {
          status: 'reconciled',
          reconciliationOutcome: input.outcome,
          providerReference,
          reconciledAt: lockedAttempt.databaseNow,
          reconciledBy: input.userId,
        },
      });
      if (reconciled.count !== 1) throw reconciliationRequired();

      if (input.outcome === 'provider_succeeded' && order.status === 'pending') {
        const updated = await tx.purchaseOrder.updateMany({
          where: {
            id: input.purchaseOrderId,
            organizationId: input.organizationId,
            status: 'pending',
          },
          data: {
            status: 'ordered',
            externalOrderPlatform: 'ALIBABA_1688',
            ...(providerReference ? { externalOrderId: providerReference } : {}),
          },
        });
        if (updated.count !== 1) throw reconciliationRequired();
      }
      return findOrder(tx, input.organizationId, input.purchaseOrderId);
    }, TRANSACTION_OPTIONS);
  }

  private completeAttempt(
    input: CompletePurchaseOrderProviderFailureInput,
    status: 'provider_failed' | 'provider_unknown',
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, input.organizationId, input.purchaseOrderId);
      const attempt = await lockAttempt(tx, input);
      if (!attempt || attempt.status !== 'prepared') throw reconciliationRequired();
      const result = await tx.purchaseOrderSubmissionAttempt.updateMany({
        where: attemptWhere(input, 'prepared'),
        data: {
          status,
          errorCode: cleanRequired(input.errorCode),
          errorMessage: cleanRequired(input.errorMessage).slice(0, 500),
        },
      });
      if (result.count !== 1) throw reconciliationRequired();
    }, TRANSACTION_OPTIONS);
  }
}

async function lockFreshness(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<LockedFreshnessRow | null> {
  const rows = await tx.$queryRaw<LockedFreshnessRow[]>`
    SELECT
      freshness_fence AS "freshnessFence",
      verified_generation AS "freshnessGeneration",
      last_verified_at AS "lastVerifiedAt",
      CURRENT_TIMESTAMP AS "databaseNow"
    FROM sellpia_inventory_states
    WHERE organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  purchaseOrderId: string,
): Promise<LockedOrderRow | null> {
  const rows = await tx.$queryRaw<LockedOrderRow[]>`
    SELECT id, status
    FROM purchase_orders
    WHERE id = ${purchaseOrderId}::uuid
      AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function lockAttempt(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    purchaseOrderId: string;
    attemptId: string;
    idempotencyKey: string;
  },
): Promise<LockedAttemptRow | null> {
  const rows = await tx.$queryRaw<LockedAttemptRow[]>`
    SELECT
      id,
      idempotency_key AS "idempotencyKey",
      status,
      provider_reference AS "providerReference",
      reconciliation_outcome AS "reconciliationOutcome",
      created_at AS "createdAt"
    FROM purchase_order_submission_attempts
    WHERE id = ${input.attemptId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND purchase_order_id = ${input.purchaseOrderId}::uuid
      AND idempotency_key = ${input.idempotencyKey}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function assertActor(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const membership = await tx.organizationMembership.findFirst({
    where: {
      organizationId,
      userId,
      status: 'active',
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new AppException(
      403,
      ErrorCodes.COMMON.UNAUTHORIZED,
      'The authenticated actor is not active in this organization.',
    );
  }
}

function assertFreshness(
  freshness: LockedFreshnessRow | null,
  input: Pick<
    PreparePurchaseOrderSubmissionInput,
    'freshnessFence' | 'freshnessLastVerifiedAt' | 'freshnessExpiresAt'
  >,
): asserts freshness is LockedFreshnessRow {
  const expectedLastVerifiedAt = new Date(input.freshnessLastVerifiedAt);
  const expiresAt = new Date(input.freshnessExpiresAt);
  if (
    !freshness
    || freshness.freshnessFence !== input.freshnessFence
    || freshness.lastVerifiedAt === null
    || Number.isNaN(expectedLastVerifiedAt.getTime())
    || Number.isNaN(expiresAt.getTime())
    || freshness.lastVerifiedAt.getTime() !== expectedLastVerifiedAt.getTime()
    || freshness.databaseNow >= expiresAt
  ) {
    throw new AppException(
      409,
      ErrorCodes.INVENTORY.SELLPIA_SYNC_REQUIRED,
      'A fresh Sellpia inventory snapshot is required before purchase.',
    );
  }
}

async function assertPurchaseItems(
  tx: Prisma.TransactionClient,
  input: PreparePurchaseOrderSubmissionInput,
): Promise<void> {
  const expectedIds = [...new Set(input.sellpiaInventorySkuIds)].sort();
  if (expectedIds.length === 0) throw referenceInvalid();
  const items = await tx.purchaseOrderItem.findMany({
    where: {
      organizationId: input.organizationId,
      orderId: input.purchaseOrderId,
    },
    select: { sellpiaInventorySkuId: true },
  });
  const actualIds = [...new Set(items.map((item) => item.sellpiaInventorySkuId))].sort();
  if (
    actualIds.length !== expectedIds.length
    || actualIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw referenceInvalid();
  }

  const inventorySkus = await tx.sellpiaInventorySku.findMany({
    where: {
      organizationId: input.organizationId,
      id: { in: expectedIds },
    },
    select: { id: true, isActive: true },
  });
  if (inventorySkus.length !== expectedIds.length) throw referenceInvalid();
  if (inventorySkus.some((sku) => !sku.isActive)) {
    throw new AppException(
      422,
      ErrorCodes.PURCHASE.ITEM_INACTIVE,
      'A purchase item is inactive in the Sellpia inventory snapshot.',
    );
  }
}

async function promoteExpiredPrepared(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; purchaseOrderId: string },
  databaseNow: Date,
  attempt: LockedAttemptRow,
): Promise<LockedAttemptRow> {
  if (
    attempt.status !== 'prepared'
    || databaseNow.getTime() - attempt.createdAt.getTime()
      < PREPARED_RECONCILIATION_MS
  ) {
    return attempt;
  }
  const update = await tx.purchaseOrderSubmissionAttempt.updateMany({
    where: {
      id: attempt.id,
      organizationId: input.organizationId,
      purchaseOrderId: input.purchaseOrderId,
      status: 'prepared',
    },
    data: {
      status: 'provider_unknown',
      errorCode: 'prepared_intent_expired',
      errorMessage: 'Prepared provider intent exceeded the reconciliation window.',
    },
  });
  return update.count === 1
    ? { ...attempt, status: 'provider_unknown' }
    : attempt;
}

function assertNormalizedIdempotencyKey(value: string): void {
  if (!value || value !== value.trim()) {
    throw new BadRequestException(
      'Purchase submission idempotency key must be normalized and nonblank.',
    );
  }
}

function attemptWhere(
  input: {
    organizationId: string;
    purchaseOrderId: string;
    attemptId: string;
    idempotencyKey: string;
  },
  status: string,
) {
  return {
    id: input.attemptId,
    organizationId: input.organizationId,
    purchaseOrderId: input.purchaseOrderId,
    idempotencyKey: input.idempotencyKey,
    status,
  };
}

async function findOrder(
  tx: Prisma.TransactionClient,
  organizationId: string,
  purchaseOrderId: string,
): Promise<PurchaseOrderSubmissionOrderState> {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId },
    select: {
      id: true,
      status: true,
      externalOrderPlatform: true,
      externalOrderId: true,
      externalOrderUrl: true,
    },
  });
  if (!order) throw referenceInvalid();
  return order;
}

function toAttemptState(attempt: {
  id: string;
  idempotencyKey: string;
  status: string;
  createdAt?: Date;
}): PurchaseOrderSubmissionAttemptState {
  if (!isAttemptStatus(attempt.status)) {
    throw new ConflictException('Purchase submission attempt has an invalid status.');
  }
  return {
    id: attempt.id,
    idempotencyKey: attempt.idempotencyKey,
    status: attempt.status,
    ...(attempt.createdAt ? { createdAt: attempt.createdAt } : {}),
  };
}

function isAttemptStatus(
  status: string,
): status is PurchaseOrderSubmissionAttemptState['status'] {
  return [
    'prepared',
    'provider_succeeded',
    'provider_failed',
    'provider_unknown',
    'reconciled',
  ].includes(status);
}

function cleanRequired(value: string): string {
  return value.trim() || 'unknown';
}

function cleanOptional(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function referenceInvalid(): AppException {
  return new AppException(
    422,
    ErrorCodes.PURCHASE.REFERENCE_INVALID,
    'Purchase order or item reference is invalid for this organization.',
  );
}

function reconciliationRequired(): AppException {
  return new AppException(
    409,
    ErrorCodes.PURCHASE.SUBMISSION_RECONCILIATION_REQUIRED,
    'The existing external purchase attempt must be reconciled before another submission.',
  );
}
