// Persistence adapter for `Alert.kind = "operation"` lifecycle writes.
// Owns the idempotent upsert against the partial unique
// `alerts_organization_id_operation_key_key` plus the transition state
// machine (running → succeeded/failed/cancelled).

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Alert } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CloseStaleOperationsCriteria,
  OperationAlertRepositoryPort,
  OperationAlertTransitionPatch,
  OperationAlertUpsertData,
} from '../../../application/port/out/repository/operation-alert.repository.port';
import { OperationAlertOwnershipConflictError } from '../../../domain/errors/operation-alert-ownership-conflict.error';

const TERMINAL_OPERATION_STATUSES = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

type BrowserCollectionOrdering = {
  attempt: number;
  updatedAt: number;
};

type OperationAlertTransaction = Pick<
  Prisma.TransactionClient,
  'alert' | '$queryRaw'
>;

function browserCollectionOrdering(
  metadata: unknown,
): BrowserCollectionOrdering | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  if (
    record.browserCollection !== true ||
    !Number.isInteger(record.collectionAttempt) ||
    (record.collectionAttempt as number) < 1 ||
    typeof record.collectionUpdatedAt !== 'number' ||
    !Number.isFinite(record.collectionUpdatedAt) ||
    record.collectionUpdatedAt < 0
  ) {
    return null;
  }
  return {
    attempt: record.collectionAttempt as number,
    updatedAt: record.collectionUpdatedAt as number,
  };
}

function compareBrowserCollectionOrdering(
  candidate: BrowserCollectionOrdering,
  current: BrowserCollectionOrdering,
): number {
  if (candidate.attempt !== current.attempt) {
    return candidate.attempt - current.attempt;
  }
  return candidate.updatedAt - current.updatedAt;
}

@Injectable()
export class OperationAlertRepositoryAdapter
  implements OperationAlertRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async upsertByOperationKey(
    organizationId: string,
    operationKey: string,
    data: OperationAlertUpsertData,
  ): Promise<Alert> {
    const incomingOrdering = browserCollectionOrdering(data.metadata);
    if (incomingOrdering) {
      return this.prisma.$transaction(async (tx) => {
        await this.lockOperationAlert(tx, organizationId, operationKey);
        return this.upsertOrderedBrowserCollection(
          tx,
          organizationId,
          operationKey,
          data,
          incomingOrdering,
        );
      });
    }

    const existing = await this.prisma.alert.findFirst({
      where: { organizationId, operationKey },
    });

    if (existing) {
      this.assertPersonalOwner(existing, data.actorUserId);
      // Re-running an operation must not flip an already-read alert back to
      // unread; honour the existing read state regardless of `data.isRead`.
      // FK scalar (`actorUserId`) is excluded from the update path —
      // `updateMany` cannot set relation FK scalars; preserve the original
      // actor from the first start call.
      const updateData: Prisma.AlertUncheckedUpdateManyInput = {
        status: data.status,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
        href: data.href,
        progress: data.progress,
        metadata: data.metadata as Prisma.InputJsonValue,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        isRead: existing.isRead,
        readAt: existing.isRead ? existing.readAt : null,
      };
      await this.prisma.alert.updateMany({
        where: {
          id: existing.id,
          organizationId,
        },
        data: updateData,
      });
      const refreshed = await this.prisma.alert.findFirst({
        where: { id: existing.id, organizationId },
      });
      if (!refreshed) {
        throw new Error('Alert vanished after update — concurrent delete?');
      }
      return refreshed;
    }

    try {
      return await this.prisma.alert.create({
        data: {
          organizationId,
          operationKey,
          kind: data.kind,
          status: data.status,
          type: data.type,
          severity: data.severity,
          title: data.title,
          message: data.message,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          actorUserId: data.actorUserId,
          targetType: data.targetType,
          targetId: data.targetId,
          href: data.href,
          progress: data.progress,
          metadata: data.metadata as Prisma.InputJsonValue,
          startedAt: data.startedAt,
          finishedAt: data.finishedAt,
          isRead: data.isRead,
          readAt: data.readAt,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Race past findFirst: another caller created the row first. The
        // legacy service returned the racy row as-is without re-updating;
        // preserve that semantics.
        const racy = await this.prisma.alert.findFirst({
          where: { organizationId, operationKey },
        });
        if (racy) {
          this.assertPersonalOwner(racy, data.actorUserId);
          return racy;
        }
      }
      throw err;
    }
  }

  private async upsertOrderedBrowserCollection(
    tx: OperationAlertTransaction,
    organizationId: string,
    operationKey: string,
    data: OperationAlertUpsertData,
    incomingOrdering: BrowserCollectionOrdering,
  ): Promise<Alert> {
    const existing = await tx.alert.findFirst({
      where: { organizationId, operationKey },
    });
    if (!existing) {
      return tx.alert.create({
        data: {
          organizationId,
          operationKey,
          kind: data.kind,
          status: data.status,
          type: data.type,
          severity: data.severity,
          title: data.title,
          message: data.message,
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          actorUserId: data.actorUserId,
          targetType: data.targetType,
          targetId: data.targetId,
          href: data.href,
          progress: data.progress,
          metadata: data.metadata as Prisma.InputJsonValue,
          startedAt: data.startedAt,
          finishedAt: data.finishedAt,
          isRead: data.isRead,
          readAt: data.readAt,
        },
      });
    }

    this.assertPersonalOwner(existing, data.actorUserId);
    const currentOrdering = browserCollectionOrdering(existing.metadata);
    if (TERMINAL_OPERATION_STATUSES.has(existing.status)) {
      if (!currentOrdering || incomingOrdering.attempt <= currentOrdering.attempt) {
        return existing;
      }
    } else if (
      currentOrdering &&
      compareBrowserCollectionOrdering(incomingOrdering, currentOrdering) <= 0
    ) {
      return existing;
    }

    await tx.alert.updateMany({
      where: { id: existing.id, organizationId },
      data: {
        status: data.status,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
        href: data.href,
        progress: data.progress,
        metadata: data.metadata as Prisma.InputJsonValue,
        startedAt: data.startedAt,
        finishedAt: data.finishedAt,
        isRead: existing.isRead,
        readAt: existing.isRead ? existing.readAt : null,
      },
    });
    const refreshed = await tx.alert.findFirst({
      where: { id: existing.id, organizationId },
    });
    if (!refreshed) {
      throw new Error('Alert vanished after update — concurrent delete?');
    }
    return refreshed;
  }

  private assertPersonalOwner(
    alert: Pick<Alert, 'actorUserId'>,
    requestedActorUserId: string | null,
  ): void {
    if (
      requestedActorUserId !== null &&
      alert.actorUserId !== requestedActorUserId
    ) {
      throw new OperationAlertOwnershipConflictError();
    }
  }

  async transition(
    organizationId: string,
    operationKey: string,
    patch: OperationAlertTransitionPatch,
  ): Promise<Alert | null> {
    const incomingOrdering = browserCollectionOrdering(patch.metadata);
    if (incomingOrdering) {
      return this.prisma.$transaction(async (tx) => {
        await this.lockOperationAlert(tx, organizationId, operationKey);
        return this.transitionOrderedBrowserCollection(
          tx,
          organizationId,
          operationKey,
          patch,
          incomingOrdering,
        );
      });
    }

    const existing = await this.prisma.alert.findFirst({
      where: { organizationId, operationKey, kind: 'operation' },
    });
    if (!existing) return null;
    if (TERMINAL_OPERATION_STATUSES.has(existing.status)) return existing;

    const mergedMetadata =
      patch.metadata !== undefined
        ? ({
            ...((existing.metadata as Record<string, unknown> | null) ?? {}),
            ...patch.metadata,
          } as Prisma.InputJsonValue)
        : (existing.metadata as Prisma.InputJsonValue);

    const updateData: Prisma.AlertUpdateManyMutationInput = {
      status: patch.status,
      message: patch.message !== undefined ? patch.message : existing.message,
      href: patch.href !== undefined ? patch.href : existing.href,
      progress:
        patch.progress !== undefined
          ? patch.progress
          : patch.progressDefault !== undefined
            ? patch.progressDefault
            : existing.progress,
      severity:
        patch.severity ?? patch.severityDefault ?? existing.severity,
      metadata: mergedMetadata,
      finishedAt: patch.finishedAt,
    };

    await this.prisma.alert.updateMany({
      where: {
        id: existing.id,
        organizationId,
        status: { in: ['pending', 'running'] },
      },
      data: updateData,
    });
    return this.prisma.alert.findFirst({
      where: { id: existing.id, organizationId },
    });
  }

  private async transitionOrderedBrowserCollection(
    tx: OperationAlertTransaction,
    organizationId: string,
    operationKey: string,
    patch: OperationAlertTransitionPatch,
    incomingOrdering: BrowserCollectionOrdering,
  ): Promise<Alert | null> {
    const existing = await tx.alert.findFirst({
      where: { organizationId, operationKey, kind: 'operation' },
    });
    if (!existing) return null;

    const currentOrdering = browserCollectionOrdering(existing.metadata);
    if (TERMINAL_OPERATION_STATUSES.has(existing.status)) {
      if (!currentOrdering || incomingOrdering.attempt <= currentOrdering.attempt) {
        return existing;
      }
    } else if (currentOrdering) {
      const comparison = compareBrowserCollectionOrdering(
        incomingOrdering,
        currentOrdering,
      );
      if (
        comparison < 0 ||
        (comparison === 0 &&
          !(existing.status === 'running' && patch.status !== 'running'))
      ) {
        return existing;
      }
    }

    const mergedMetadata = {
      ...((existing.metadata as Record<string, unknown> | null) ?? {}),
      ...(patch.metadata ?? {}),
    } as Prisma.InputJsonValue;
    await tx.alert.updateMany({
      where: { id: existing.id, organizationId },
      data: {
        status: patch.status,
        message: patch.message !== undefined ? patch.message : existing.message,
        href: patch.href !== undefined ? patch.href : existing.href,
        progress:
          patch.progress !== undefined
            ? patch.progress
            : patch.progressDefault !== undefined
              ? patch.progressDefault
              : existing.progress,
        severity:
          patch.severity ?? patch.severityDefault ?? existing.severity,
        metadata: mergedMetadata,
        finishedAt: patch.finishedAt,
      },
    });
    return tx.alert.findFirst({
      where: { id: existing.id, organizationId },
    });
  }

  private async lockOperationAlert(
    tx: OperationAlertTransaction,
    organizationId: string,
    operationKey: string,
  ): Promise<void> {
    const lockKey = `operation-alert:${organizationId}:${operationKey}`;
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "lock"
    `;
    await tx.$queryRaw`
      SELECT id
      FROM alerts
      WHERE organization_id = ${organizationId}::uuid
        AND operation_key = ${operationKey}
      FOR UPDATE
    `;
  }

  async findLatestBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<Alert | null> {
    return this.prisma.alert.findFirst({
      where: { organizationId, sourceType, sourceId, kind: 'operation' },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByOperationKey(
    organizationId: string,
    operationKey: string,
  ): Promise<Alert | null> {
    return this.prisma.alert.findFirst({
      where: { organizationId, operationKey },
    });
  }

  async closeStaleOperations(
    criteria: CloseStaleOperationsCriteria,
  ): Promise<Alert[]> {
    const staleAlerts = await this.prisma.alert.findMany({
      where: {
        ...(criteria.organizationId
          ? { organizationId: criteria.organizationId }
          : {}),
        kind: 'operation',
        status: { in: ['pending', 'running'] },
        ...(criteria.type ? { type: criteria.type } : {}),
        sourceType: criteria.sourceType,
        ...(criteria.operationKeyPrefix !== undefined
          ? { operationKey: { startsWith: criteria.operationKeyPrefix } }
          : {}),
        updatedAt: { lt: criteria.staleBefore },
      },
      orderBy: { updatedAt: 'asc' },
      take: criteria.limit,
    });

    if (staleAlerts.length === 0) return [];

    const finishedAt = new Date();
    const closed: Alert[] = [];
    for (const alert of staleAlerts) {
      const mergedMetadata = {
        ...((alert.metadata as Record<string, unknown> | null) ?? {}),
        ...((criteria.metadata as Record<string, unknown> | null) ?? {}),
      } as Prisma.InputJsonValue;
      // Race-aware: only close rows still in pending/running. A concurrent
      // lifecycle call may have already terminated the row between the
      // findMany above and this updateMany.
      // Severity: caller-supplied wins, otherwise preserve the row's
      // existing severity (failed status falls back to 'error' before
      // touching the row, but only if caller did not pass severity).
      const severity =
        criteria.severity ??
        (criteria.status === 'failed' ? 'error' : alert.severity);
      const { count } = await this.prisma.alert.updateMany({
        where: {
          id: alert.id,
          organizationId: alert.organizationId,
          status: { in: ['pending', 'running'] },
        },
        data: {
          status: criteria.status,
          severity,
          message: criteria.message,
          metadata: mergedMetadata,
          finishedAt,
        },
      });
      if (count === 0) continue;
      const refreshed = await this.prisma.alert.findFirst({
        where: { id: alert.id, organizationId: alert.organizationId },
      });
      if (refreshed) closed.push(refreshed);
    }
    return closed;
  }
}
