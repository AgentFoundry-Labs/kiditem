import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { redact } from '../common/redact';
import type {
  AlertItem,
  SourceFailureAlertInput,
} from '@kiditem/shared/alerts';
import type { Alert } from '@prisma/client';

export type { SourceFailureAlertInput } from '@kiditem/shared/alerts';

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
 * The focused source failure + operator notification seam.
 *
 * Source owners pass their already-open Prisma transaction to the two source
 * methods below, so a source's terminal mutation and its Alert commit or roll
 * back as one PostgreSQL unit — no event, outbox, or generic alert port. This
 * module never starts a nested transaction or invokes an Operation worker.
 *
 * It was two classes with identical interfaces, one delegating to the other a
 * line at a time. One adapter is a hypothetical seam, and every test paid for
 * it twice.
 */
@Injectable()
export class SourceFailureAlerts {
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

  /**
   * Record how a source attempt ended. The module decides whether that is worth
   * an operator's attention at all, and shapes the message it will read.
   *
   * The three rules below used to be the caller's homework, and 24 call sites
   * kept them 24 different ways: credentials were scrubbed at 4 of them, the
   * column width was restated at each, and a user's cancellation was suppressed
   * under five different code spellings — or, in every `sourcing` owner, not at
   * all, so stopping a collection raised an error alert.
   */
  async recordTerminalOutcome(
    tx: Prisma.TransactionClient,
    input: SourceFailureAlertInput,
  ): Promise<void> {
    // A cancellation is the operator's own action, not a failure to show them
    // back. Every owner already names one `*_CANCELLED`, in five spellings —
    // `USER_CANCELLED`, `COLLECTION_CANCELLED`, `SOURCE_COLLECTION_CANCELLED`,
    // `SHADOW_COLLECTION_CANCELLED` — which is why the suffix is the rule and
    // not a list. `ATTEMPT_EXPIRED` deliberately still alerts: a collection that
    // never finished is something the operator wants to know about.
    if (input.code.endsWith('_CANCELLED')) {
      return this.resolveSourceFailure(tx, input);
    }
    return this.upsertSourceFailure(tx, input);
  }

  private async upsertSourceFailure(
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

/** The column is 300 wide; callers were each restating that. */
const MESSAGE_LIMIT = 300;


function sourceFailureData(input: SourceFailureAlertInput) {
  return {
    organizationId: input.organizationId,
    dedupeKey: input.dedupeKey,
    sourceType: input.sourceType,
    attemptId: input.attemptId,
    kind: 'signal',
    status: 'OPEN',
    type: 'source_failure',
    // Every production site passed 'error'. It was a parameter that never varied.
    severity: 'error',
    title: input.title,
    message: redact(input.message).slice(0, MESSAGE_LIMIT),
    href: input.href,
    isRead: false,
    readAt: null,
  } satisfies Prisma.AlertUncheckedCreateInput;
}
