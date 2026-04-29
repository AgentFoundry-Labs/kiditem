import { Prisma, type AdAction } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActionCandidate } from '../domain/ad-action-rules';

/**
 * Tenant-scoped lifecycle writers for `AdAction` and the dependent
 * `ExecutionTask` queue.
 *
 * Each helper is the single place that performs the underlying write
 * invariant — generation, approve+queue, reject+cancel, reset+requeue, and
 * single-row scoped state transitions. Callers that need to span multiple
 * writes (approve/reject/reset) pass in a `Prisma.TransactionClient` so the
 * service layer keeps `$transaction` ownership.
 */

type AdActionTxClient = Prisma.TransactionClient | PrismaService;

/**
 * Persist a batch of action candidates as `AdAction` rows scoped to one
 * company. Returns the created rows in input order so the caller can build a
 * preview list without re-querying.
 */
export async function createAdActionsFromCandidates(
  prisma: PrismaService,
  companyId: string,
  candidates: ActionCandidate[],
): Promise<AdAction[]> {
  if (candidates.length === 0) return [];
  return prisma.$transaction(
    candidates.map((c) =>
      prisma.adAction.create({
        data: {
          companyId,
          listingId: c.listingId,
          // Audit pointer to source daily fact row.
          adTargetDailyId: c.adTargetDailyId,
          actionType: c.actionType,
          targetType: c.targetType,
          externalId: c.externalId,
          targetLabel: c.targetLabel,
          reason: c.reason,
          priority: c.priority,
          currentValue: c.currentValue,
          proposedValue: c.proposedValue,
          payload: c.payload as Prisma.InputJsonValue,
        },
      }),
    ),
  );
}

/**
 * Approve actions in a tenant-scoped batch and idempotently enqueue an
 * `ExecutionTask` for each approved action that has no open task.
 *
 * The single approve+enqueue invariant must run inside one transaction so a
 * crash between the two writes cannot leave an approved action without its
 * matching execution task.
 */
export async function approveAdActions(
  tx: Prisma.TransactionClient,
  ids: string[],
  companyId: string,
): Promise<void> {
  await tx.adAction.updateMany({
    where: { id: { in: ids }, companyId },
    data: {
      approvalStatus: 'approved',
      approvedAt: new Date(),
      executeStatus: 'queued',
    },
  });

  const scopedActions = await tx.adAction.findMany({
    where: { id: { in: ids }, companyId },
    select: { id: true },
  });
  const scopedIds = scopedActions.map((a) => a.id);
  if (scopedIds.length === 0) return;

  const existingOpenTasks = await tx.executionTask.findMany({
    where: { actionId: { in: scopedIds }, status: { in: ['queued', 'leased', 'running'] } },
    select: { actionId: true },
  });
  const existingSet = new Set(existingOpenTasks.map((t) => t.actionId));

  const toCreate = scopedIds
    .filter((id) => !existingSet.has(id))
    .map((id) => ({ actionId: id, status: 'queued' }));

  if (toCreate.length > 0) {
    await tx.executionTask.createMany({ data: toCreate });
  }
}

/**
 * Reject actions in a tenant-scoped batch and cancel any open execution
 * tasks for those actions in the same transaction.
 *
 * `executeStatus` is intentionally moved to `'queued'` to match the existing
 * behavior — cancellation is recorded on the `ExecutionTask` rows.
 */
export async function rejectAdActions(
  tx: Prisma.TransactionClient,
  ids: string[],
  companyId: string,
): Promise<void> {
  await tx.adAction.updateMany({
    where: { id: { in: ids }, companyId },
    data: { approvalStatus: 'rejected', executeStatus: 'queued' },
  });

  const scopedActions = await tx.adAction.findMany({
    where: { id: { in: ids }, companyId },
    select: { id: true },
  });
  const scopedIds = scopedActions.map((a) => a.id);
  if (scopedIds.length === 0) return;

  await tx.executionTask.updateMany({
    where: { actionId: { in: scopedIds }, status: { in: ['queued', 'leased'] } },
    data: { status: 'cancelled', finishedAt: new Date(), errorMessage: '사용자 보류 처리' },
  });
}

/**
 * Re-queue every approved-but-failed action for the company and create a
 * fresh `ExecutionTask` per re-queued action so the worker fleet picks them
 * up on the next lease cycle.
 */
export async function resetFailedAdActions(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<void> {
  const failedActions = await tx.adAction.findMany({
    where: { companyId, executeStatus: 'failed', approvalStatus: 'approved' },
    select: { id: true },
  });

  if (failedActions.length === 0) return;
  const ids = failedActions.map((a) => a.id);

  await tx.adAction.updateMany({
    where: { id: { in: ids }, companyId },
    data: { executeStatus: 'queued', errorMessage: null },
  });

  await tx.executionTask.createMany({
    data: ids.map((id) => ({ actionId: id, status: 'queued' })),
  });
}

/**
 * Tenant-scoped single-row state transition for `AdAction`. Throws
 * `NotFoundException` when the row does not belong to the company so cross-
 * tenant id usage cannot silently no-op.
 */
export async function updateActionOrThrow(
  prisma: AdActionTxClient,
  id: string,
  companyId: string,
  data: Prisma.AdActionUpdateManyMutationInput,
): Promise<void> {
  const updated = await prisma.adAction.updateMany({
    where: { id, companyId },
    data,
  });
  if (updated.count !== 1) throw new NotFoundException('AdAction not found');
}
