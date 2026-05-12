import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { alertPanelMapper } from '../../mapper/panel-event/alert.mapper';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';
import {
  OPERATION_ALERT_REPOSITORY_PORT,
  type OperationAlertRepositoryPort,
} from '../port/out/operation-alert.repository.port';
import type {
  CloseStaleOperationAlertsInput,
  OperationAlertPort,
  OperationLifecyclePatch,
  StartOperationAlertInput,
} from '../port/in/operation-alert.port';
import type { AlertRecord } from '../port/persistence-records';

/**
 * OperationAlertService — write-side surface for `Alert.kind = "operation"`.
 *
 * Implements the owner-side `OPERATION_ALERT_PORT` (port/in) published from
 * `application/port/in/operation-alert.port.ts`. Cross-owner-domain
 * consumers (advertising, ai, channels, finance, rules, sourcing,
 * analytics/traffic) bind their consumer-side automation adapter to that
 * token instead of injecting this class directly.
 *
 * Idempotency contract:
 * - Identity is `(organizationId, operationKey)`. The schema enforces this via
 *   the partial unique `alerts_organization_id_operation_key_key`
 *   (`operation_key IS NOT NULL`).
 * - `start()` upserts: existing row with the same key is reused (re-run /
 *   retry) and re-emits, otherwise a new row is created. Two concurrent calls
 *   that race past `findFirst` resolve via the unique-constraint conflict
 *   → re-fetch path (delegated to the repository adapter).
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
@Injectable()
export class OperationAlertService implements OperationAlertPort {
  private readonly logger = new Logger(OperationAlertService.name);

  constructor(
    @Inject(OPERATION_ALERT_REPOSITORY_PORT)
    private readonly repository: OperationAlertRepositoryPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async start(input: StartOperationAlertInput): Promise<AlertRecord> {
    const now = new Date();
    const alert = await this.repository.upsertByOperationKey(
      input.organizationId,
      input.operationKey,
      {
        kind: 'operation',
        status: 'running',
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
        metadata: (input.metadata ?? {}) as Record<string, unknown>,
        startedAt: now,
        finishedAt: null,
        isRead: false,
        readAt: null,
      },
    );
    this.emitUpsert(alert);
    return alert;
  }

  findByOperationKey(
    organizationId: string,
    operationKey: string,
  ): Promise<AlertRecord | null> {
    return this.repository.findByOperationKey(organizationId, operationKey);
  }

  async progress(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch,
  ): Promise<AlertRecord | null> {
    const result = await this.repository.transition(organizationId, operationKey, {
      ...patch,
      status: 'running',
      finishedAt: null,
    });
    if (result) this.emitUpsert(result);
    return result;
  }

  async succeed(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<AlertRecord | null> {
    const result = await this.repository.transition(organizationId, operationKey, {
      ...patch,
      status: 'succeeded',
      finishedAt: new Date(),
      progressDefault: 1,
    });
    if (result) this.emitUpsert(result);
    return result;
  }

  async fail(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<AlertRecord | null> {
    const result = await this.repository.transition(organizationId, operationKey, {
      ...patch,
      status: 'failed',
      finishedAt: new Date(),
      severityDefault: 'error',
    });
    if (result) this.emitUpsert(result);
    return result;
  }

  async cancel(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<AlertRecord | null> {
    const result = await this.repository.transition(organizationId, operationKey, {
      ...patch,
      status: 'cancelled',
      finishedAt: new Date(),
    });
    if (result) this.emitUpsert(result);
    return result;
  }

  /**
   * Close any operation alert linked to a specific (sourceType, sourceId)
   * tuple. Used by cross-domain bridges (eg. AgentRun finalize) that know the
   * upstream identity but not which producer set up the operationKey.
   */
  async closeBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    status: 'succeeded' | 'failed' | 'cancelled',
    patch: OperationLifecyclePatch = {},
  ): Promise<AlertRecord | null> {
    const existing = await this.repository.findLatestBySource(
      organizationId,
      sourceType,
      sourceId,
    );
    if (!existing || !existing.operationKey) return null;
    if (status === 'succeeded') {
      return this.succeed(organizationId, existing.operationKey, patch);
    }
    if (status === 'failed') {
      return this.fail(organizationId, existing.operationKey, patch);
    }
    return this.cancel(organizationId, existing.operationKey, patch);
  }

  async closeStaleOperations(
    input: CloseStaleOperationAlertsInput,
  ): Promise<AlertRecord[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 500));
    // Severity defaulting (failed→error, else carry per-row) happens in the
    // repository adapter so each row's existing severity is preserved
    // without forcing the service to fetch the rows first.
    const closed = await this.repository.closeStaleOperations({
      sourceType: input.sourceType,
      operationKeyPrefix: input.operationKeyPrefix,
      staleBefore: input.staleBefore,
      status: input.status,
      message: input.message,
      severity: input.severity,
      metadata: (input.metadata ?? {}) as Record<string, unknown>,
      limit,
    });
    for (const row of closed) this.emitUpsert(row);
    return closed;
  }

  private emitUpsert(alert: AlertRecord): void {
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
