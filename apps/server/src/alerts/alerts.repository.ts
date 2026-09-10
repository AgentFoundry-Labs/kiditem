import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AlertItem,
  SourceFailureAlertInput,
} from '@kiditem/shared/alerts';
import type { Alert } from '@prisma/client';

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function iso(value: Date | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

function mapAlert(row: Alert): AlertItem {
  return {
    id: row.id,
    organizationId: row.organizationId,
    dedupeKey: row.dedupeKey,
    attemptId: row.attemptId,
    kind: row.kind as AlertItem['kind'],
    status: row.status as AlertItem['status'],
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    targetType: row.targetType,
    targetId: row.targetId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    actorUserId: row.actorUserId,
    href: row.href,
    metadata: jsonObject(row.metadata),
    isRead: row.isRead,
    readAt: iso(row.readAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies AlertItem;
}

/**
 * Persistence for the focused Alert surface.
 *
 * Source owners pass their already-open Prisma transaction to the two source
 * methods below. The repository never starts a nested transaction, emits an
 * event, or invokes an Operation worker.
 */
@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string): Promise<AlertItem[]> {
    const rows = await this.prisma.alert.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(mapAlert);
  }

  async dismiss(id: string, organizationId: string): Promise<void> {
    const result = await this.prisma.alert.updateMany({
      where: {
        id,
        organizationId,
        status: 'OPEN',
      },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Alert not found');
  }

  async upsertSourceFailure(
    tx: Prisma.TransactionClient,
    input: SourceFailureAlertInput,
  ): Promise<void> {
    const existing = await tx.alert.findUnique({
      where: {
        organizationId_dedupeKey: {
          organizationId: input.organizationId,
          dedupeKey: input.dedupeKey,
        },
      },
    });

    // A replay of the same attempt is intentionally a read-only operation:
    // this preserves both read state and timestamps that drive unread UI.
    if (existing?.attemptId === input.attemptId) return;

    const data = sourceFailureData(input);
    if (!existing) {
      await tx.alert.create({ data });
      return;
    }

    const result = await tx.alert.updateMany({
      where: {
        id: existing.id,
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
      },
      data,
    });
    if (result.count === 0) {
      throw new NotFoundException('Alert not found');
    }
  }

  async resolveSourceFailure(
    tx: Prisma.TransactionClient,
    input: Pick<SourceFailureAlertInput, 'organizationId' | 'dedupeKey' | 'attemptId'>,
  ): Promise<void> {
    // The source owner has already fenced terminal completion to the current
    // attempt in its transaction. The alert row therefore follows that
    // completion attempt instead of comparing opaque UUIDs here.
    await tx.alert.updateMany({
      where: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
        status: 'OPEN',
      },
      // Resolution does not alter read state; dismiss is the only read
      // mutation exposed by the web surface.
      data: { status: 'RESOLVED', attemptId: input.attemptId },
    });
  }

}

function sourceFailureData(input: SourceFailureAlertInput) {
  return {
    organizationId: input.organizationId,
    dedupeKey: input.dedupeKey,
    sourceType: input.sourceType,
    attemptId: input.attemptId,
    kind: 'signal',
    status: 'OPEN',
    type: 'source_failure',
    severity: input.severity,
    title: input.title,
    message: input.message,
    href: input.href,
    isRead: false,
    readAt: null,
  } satisfies Prisma.AlertUncheckedCreateInput;
}
