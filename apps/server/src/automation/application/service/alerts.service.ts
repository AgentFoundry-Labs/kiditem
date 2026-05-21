import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { kstDayStart } from '../../../common/kst';
import { alertPanelMapper } from '../../mapper/panel-event/alert.mapper';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';
import {
  ALERTS_REPOSITORY_PORT,
  type AlertsRepositoryPort,
} from '../port/out/repository/alerts.repository.port';
import type { ActionTaskRecord, AlertRecord } from '../port/persistence-records';

/**
 * Application-internal command type for `AlertsService.promote`.
 *
 * The HTTP DTO (`PromoteAlertDto` under `adapter/in/http/dto/alerts/`) is a
 * class-validator class — it belongs at the inbound adapter boundary. The
 * application service must not type-depend on the HTTP DTO class
 * (apps/server/AGENTS.md "Application-internal command/result types" rule).
 * The controller maps DTO fields into this shape.
 */
export interface PromoteAlertInput {
  priorityOverride?: string;
  roleOverride?: string;
  note?: string;
}

// ── severity → ActionTask.priority mapping ──────────────────────────────────
const SEVERITY_TO_PRIORITY: Record<string, 'urgent' | 'high' | 'medium'> = {
  critical: 'urgent',
  error: 'high',
  warning: 'medium',
  info: 'medium',
};

function mapSeverityToPriority(severity: string): 'urgent' | 'high' | 'medium' {
  return SEVERITY_TO_PRIORITY[severity] ?? 'medium';
}

// ── alertType → ActionTask.role mapping ─────────────────────────────────────
// Values observed in codebase: 'rule_violation', 'batch_summary', 'strategy_change', 'workflow'
// Known role values from action-board: 'ad' | 'inventory' | 'finance' | 'data'
const ALERT_TYPE_TO_ROLE: Record<string, string> = {
  strategy_change: 'ad',
  rule_violation: 'data',
  batch_summary: 'data',
  workflow: 'data',
};

function mapAlertTypeToRole(type: string): string | null {
  return ALERT_TYPE_TO_ROLE[type] ?? null;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @Inject(ALERTS_REPOSITORY_PORT)
    private readonly repository: AlertsRepositoryPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  findAll(organizationId: string, limit?: number) {
    return this.repository.findUnreadAlerts(organizationId, limit);
  }

  async markAsRead(id: string, organizationId: string): Promise<AlertRecord> {
    const alert = await this.repository.markAsRead(id, organizationId);
    this.emitPanelUpsert(alert, organizationId, 'markAsRead');
    return alert;
  }

  async markAllAsRead(organizationId: string): Promise<{ updated: number }> {
    const result = await this.repository.markAllAsRead(organizationId);
    for (const alert of result.alerts) {
      this.emitPanelUpsert(alert, organizationId, 'markAllAsRead');
    }
    return { updated: result.updated };
  }

  /**
   * Promote an alert to an ActionTask atomically.
   *
   * Race guard:
   *  1. findFirst + actionTaskId != null check → ConflictException (already promoted)
   *  2. actionTask.create inside $transaction — @@unique([organizationId, taskKey, date])
   *     P2002 on create → ConflictException('Already promoted (race)')
   *  3. alert.updateMany with organizationId + actionTaskId: null — atomic ownership claim
   *     count=0 → rollback (delete task) + ConflictException
   *
   * Emit is OUTSIDE $transaction: guaranteed to fire only after commit so SSE
   * subscribers observe a consistent DB state.
   */
  async promote(
    alertId: string,
    organizationId: string,
    input: PromoteAlertInput,
    _currentUserId: string,
  ): Promise<{ task: ActionTaskRecord; updatedAlert: AlertRecord }> {
    const result = await this.repository.promoteAlertToTask({
      alertId,
      organizationId,
      priorityOverride: input.priorityOverride,
      roleOverride: input.roleOverride,
      resolvePriority: (alert) => mapSeverityToPriority(alert.severity),
      resolveRole: (alert) => mapAlertTypeToRole(alert.type),
      date: kstDayStart(new Date()),
    });

    // Emit AFTER $transaction commit — SSE subscribers observe consistent state
    this.emitPanelUpsert(result.updatedAlert, organizationId, 'promote');

    return result;
  }

  /**
   * Dismiss an alert — marks isRead=true and emits PANEL_EVENTS.DISMISS.
   *
   * NOT a delete: alert stays in DB. Client store removes it from live view via
   * the dismiss event. The 24h window means it continues to appear in history.
   */
  async dismiss(alertId: string, organizationId: string): Promise<void> {
    await this.repository.dismissAlert(alertId, organizationId);
    try {
      this.eventEmitter.emit(PANEL_EVENTS.DISMISS, {
        itemId: alertId,
        organizationId,
      });
    } catch (err) {
      this.logger.warn('Panel dismiss emit failed', err);
    }
  }

  private emitPanelUpsert(
    alert: AlertRecord,
    organizationId: string,
    context: string,
  ) {
    try {
      const item = alertPanelMapper.mapToItem(alert);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, {
        item,
        organizationId,
      });
    } catch (err) {
      this.logger.warn(`Panel emit failed after ${context}`, err);
    }
  }
}
