import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Alert } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { alertPanelMapper } from '../../mapper/panel-event/alert.mapper';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';

/**
 * OperationAlertService — write-side surface for `Alert.kind = "operation"`.
 *
 * Background: PR #209 extended `Alert` into a unified dashboard notification +
 * operation ledger (kind/status/operationKey/source/actor/progress/metadata/
 * timestamps). This service is the boundary that user-triggered, long-running
 * operations call to publish their lifecycle into that ledger so the panel can
 * render running/succeeded/failed state.
 *
 * Idempotency contract:
 * - Identity is `(organizationId, operationKey)`. The schema enforces this via
 *   the partial unique `alerts_organization_id_operation_key_key`
 *   (`operation_key IS NOT NULL`).
 * - `start()` upserts: existing row with the same key is reused (re-run /
 *   retry) and re-emits, otherwise a new row is created. Two concurrent calls
 *   that race past `findFirst` resolve via the unique-constraint conflict
 *   → re-fetch + update path.
 * - `succeed()` / `fail()` / `progress()` / `cancel()` are no-ops if the alert
 *   does not exist (e.g. the producer never started one) so producers can call
 *   them defensively without try/catch noise.
 *
 * Tenancy: every write is gated on `organizationId`. Producers MUST pass the
 * `@CurrentOrganization()`-resolved id. Producer-supplied `actorUserId` should
 * come from `@CurrentUser().id` (or `null` for org-wide / system-triggered
 * operations).
 *
 * Panel emit happens after the DB write commits. Emit failures are logged but
 * never fail the producing operation — `Alert` is observability, not the
 * primary business path.
 */

export type OperationAlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface StartOperationAlertInput {
  organizationId: string;
  operationKey: string;
  type: string;
  title: string;
  message?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  href?: string | null;
  severity?: OperationAlertSeverity;
  progress?: number | null;
  metadata?: Record<string, unknown>;
}

export interface OperationLifecyclePatch {
  message?: string | null;
  href?: string | null;
  progress?: number | null;
  severity?: OperationAlertSeverity;
  /**
   * Shallow-merged into the existing metadata JSON. Use this to attach result
   * counts, agent run ids, or error details without overwriting earlier
   * lifecycle metadata.
   */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OperationAlertService {
  private readonly logger = new Logger(OperationAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Idempotent start. If an alert with the same `(organizationId, operationKey)`
   * exists it is updated to `running` and re-emitted; otherwise a new row is
   * created. Returns the row that subsequent lifecycle calls will key off.
   */
  async start(input: StartOperationAlertInput): Promise<Alert> {
    const now = new Date();
    const baseData = {
      kind: 'operation' as const,
      status: 'running' as const,
      type: input.type,
      severity: input.severity ?? 'info',
      title: input.title,
      message: input.message ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      actorUserId: input.actorUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      href: input.href ?? null,
      progress: input.progress ?? 0,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    };

    const alert = await this.upsertByOperationKey(
      input.organizationId,
      input.operationKey,
      {
        ...baseData,
        startedAt: now,
        finishedAt: null,
        isRead: false,
        readAt: null,
      },
    );

    this.emitUpsert(alert);
    return alert;
  }

  async progress(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch,
  ): Promise<Alert | null> {
    return this.transition(organizationId, operationKey, 'running', patch, {
      finishedAt: null,
    });
  }

  async succeed(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<Alert | null> {
    return this.transition(organizationId, operationKey, 'succeeded', patch, {
      finishedAt: new Date(),
      progressDefault: 1,
    });
  }

  async fail(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<Alert | null> {
    return this.transition(organizationId, operationKey, 'failed', patch, {
      finishedAt: new Date(),
      severityDefault: 'error',
    });
  }

  async cancel(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<Alert | null> {
    return this.transition(organizationId, operationKey, 'cancelled', patch, {
      finishedAt: new Date(),
    });
  }

  /**
   * Close any operation alert linked to a specific (sourceType, sourceId)
   * tuple. Used by cross-domain bridges (eg. AgentRun finalize) that know the
   * upstream identity but not which producer set up the operationKey.
   *
   * Returns null when no matching alert exists or when the matched alert has
   * no `operationKey` (defensive: closes only target rows the producer
   * intended as operations).
   */
  async closeBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    status: 'succeeded' | 'failed' | 'cancelled',
    patch: OperationLifecyclePatch = {},
  ): Promise<Alert | null> {
    const existing = await this.prisma.alert.findFirst({
      where: { organizationId, sourceType, sourceId, kind: 'operation' },
      orderBy: { createdAt: 'desc' },
    });
    if (!existing || !existing.operationKey) return null;
    if (status === 'succeeded') {
      return this.succeed(organizationId, existing.operationKey, patch);
    }
    if (status === 'failed') {
      return this.fail(organizationId, existing.operationKey, patch);
    }
    return this.cancel(organizationId, existing.operationKey, patch);
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async transition(
    organizationId: string,
    operationKey: string,
    status: 'running' | 'succeeded' | 'failed' | 'cancelled',
    patch: OperationLifecyclePatch,
    options: {
      finishedAt: Date | null;
      progressDefault?: number;
      severityDefault?: OperationAlertSeverity;
    },
  ): Promise<Alert | null> {
    const existing = await this.prisma.alert.findFirst({
      where: { organizationId, operationKey },
    });
    if (!existing) {
      // Producers may call defensively without ever having started one. Don't
      // synthesise an alert from a closing call — the start side carries the
      // title/source/href contract that lifecycle calls are not required to
      // re-supply.
      return null;
    }

    const mergedMetadata = this.mergeMetadata(existing.metadata, patch.metadata);
    const data: Prisma.AlertUpdateManyMutationInput = {
      status,
      message: patch.message !== undefined ? patch.message : existing.message,
      href: patch.href !== undefined ? patch.href : existing.href,
      progress:
        patch.progress !== undefined
          ? patch.progress
          : options.progressDefault !== undefined
            ? options.progressDefault
            : existing.progress,
      severity: patch.severity ?? options.severityDefault ?? existing.severity,
      metadata: mergedMetadata as Prisma.InputJsonValue,
      finishedAt: options.finishedAt,
    };

    await this.prisma.alert.updateMany({
      where: { id: existing.id, organizationId },
      data,
    });

    const refreshed = await this.prisma.alert.findFirst({
      where: { id: existing.id, organizationId },
    });
    if (!refreshed) return null;

    this.emitUpsert(refreshed);
    return refreshed;
  }

  /**
   * Idempotent upsert keyed by `(organizationId, operationKey)`. The schema
   * partial unique index lets us safely treat P2002 as "another writer won the
   * create race" → re-fetch and update.
   */
  private async upsertByOperationKey(
    organizationId: string,
    operationKey: string,
    data: Prisma.AlertUncheckedCreateWithoutOrganizationInput,
  ): Promise<Alert> {
    const existing = await this.prisma.alert.findFirst({
      where: { organizationId, operationKey },
    });
    if (existing) {
      await this.prisma.alert.updateMany({
        where: { id: existing.id, organizationId },
        data: {
          ...data,
          // Re-running an operation must not silently flip an already-read
          // alert back to unread; the user closed it. Honour the explicit
          // `isRead: false` in `data` only on first creation.
          isRead: existing.isRead,
          readAt: existing.isRead ? existing.readAt : null,
        },
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
          ...data,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Another caller raced past findFirst → updated row exists now.
        const racy = await this.prisma.alert.findFirst({
          where: { organizationId, operationKey },
        });
        if (racy) return racy;
      }
      throw err;
    }
  }

  private mergeMetadata(
    existing: Prisma.JsonValue,
    incoming: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    if (!incoming) return base;
    return { ...base, ...incoming };
  }

  private emitUpsert(alert: Alert): void {
    try {
      const item = alertPanelMapper.mapToItem(alert);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
        item,
        organizationId: alert.organizationId,
      });
    } catch (err) {
      this.logger.warn(
        `Panel emit failed for operation alert ${alert.id} (${alert.operationKey ?? 'no-key'}): ${err}`,
      );
    }
  }
}
