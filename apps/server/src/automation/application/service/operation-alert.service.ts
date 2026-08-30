import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { alertPanelMapper } from '../../mapper/panel-event/alert.mapper';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';
import {
  OPERATION_ALERT_REPOSITORY_PORT,
  type OperationAlertRepositoryPort,
} from '../port/out/repository/operation-alert.repository.port';
import type {
  CloseStaleOperationAlertsInput,
  OperationAlertPort,
  OperationLifecyclePatch,
  StartOperationAlertInput,
} from '../port/in/operation-alert.port';
import type { AlertRecord } from '../port/persistence-records';
import {
  OPERATION_ALERT_SOURCE_STATE_PORT,
  type OperationAlertSourceStatePort,
} from '../port/out/operations/operation-alert-source-state.port';

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
 * - `attention()` / `succeed()` / `fail()` / `progress()` / `cancel()` are
 *   no-ops if the alert does not exist (e.g. the producer never started one)
 *   so producers can call them defensively without try/catch noise.
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
    @Optional()
    @Inject(OPERATION_ALERT_SOURCE_STATE_PORT)
    private readonly sourceStates?: OperationAlertSourceStatePort,
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
    return this.reconcileSource(alert);
  }

  async reconcileSource(input: Pick<AlertRecord, 'organizationId' | 'operationKey' | 'sourceType' | 'sourceId'>): Promise<AlertRecord> {
    if (!input.sourceType || !input.sourceId || !this.sourceStates) {
      return input as AlertRecord;
    }
    const state = await this.sourceStates.find({
      organizationId: input.organizationId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    if (!state) return input as AlertRecord;
    const current = input.operationKey
      ? input as AlertRecord
      : await this.repository.findLatestBySource(
          input.organizationId,
          input.sourceType,
          input.sourceId,
        );
    if (!current?.operationKey) return input as AlertRecord;
    if (state.state === 'succeeded') {
      return await this.succeed(current.organizationId, current.operationKey!, {
        message: null,
      }) ?? current;
    }
    if (state.state === 'failed') {
      return await this.fail(current.organizationId, current.operationKey!, {
        message: state.errorMessage ?? state.errorCode,
      }) ?? current;
    }
    if (state.state === 'cancelled') {
      return await this.cancel(current.organizationId, current.operationKey!, {
        message: state.errorMessage ?? state.errorCode,
      }) ?? current;
    }
    if (state.state === 'attention_required') {
      return await this.attention(current.organizationId, current.operationKey!, {
        message: state.errorMessage ?? state.errorCode,
      }) ?? current;
    }
    return current;
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
    if (result?.status === 'running') this.emitUpsert(result);
    return result;
  }

  async attention(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch = {},
  ): Promise<AlertRecord | null> {
    const result = await this.repository.transition(organizationId, operationKey, {
      ...patch,
      status: 'pending',
      finishedAt: null,
      severityDefault: 'warning',
    });
    if (result?.status === 'pending') this.emitUpsert(result);
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
    if (result?.status === 'succeeded') this.emitUpsert(result);
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
    if (result?.status === 'failed') this.emitUpsert(result);
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
    if (result?.status === 'cancelled') this.emitUpsert(result);
    return result;
  }

  /**
   * Close any operation alert linked to a specific (sourceType, sourceId)
   * tuple. Used by cross-domain finalized-event bridges that know the
   * upstream identity but not which producer set up the operationKey.
   */
  async closeBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    status: 'succeeded' | 'failed' | 'cancelled' | 'attention_required',
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
    if (status === 'attention_required') {
      return this.attention(organizationId, existing.operationKey, patch);
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
      organizationId: input.organizationId,
      type: input.type,
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

  async dismissExtensionMissingBrowserCollections(
    organizationId: string,
    actorUserId: string,
  ): Promise<AlertRecord[]> {
    const dismissed =
      await this.repository.dismissExtensionMissingBrowserCollections(
        organizationId,
        actorUserId,
      );
    for (const row of dismissed) this.emitDismiss(row);
    return dismissed;
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

  private emitDismiss(alert: AlertRecord): void {
    try {
      this.eventEmitter.emit(PANEL_EVENTS.DISMISS, {
        itemId: alert.id,
        organizationId: alert.organizationId,
      });
    } catch (err) {
      this.logger.warn(
        `Panel dismiss emit failed for operation alert ${alert.id}: ${err}`,
      );
    }
  }
}
