import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Alert, ActionTask } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { kstDayStart } from '../../../common/kst';
import { alertPanelMapper } from '../../mapper/panel-event/alert.mapper';
import { PANEL_EVENTS } from '../../adapter/out/panel-event/panel-events';
import type { AlertItem } from '@kiditem/shared/alerts';

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

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(organizationId: string, limit?: number) {
    try {
      const rows = await this.prisma.alert.findMany({
        where: { organizationId, isRead: false },
        orderBy: { createdAt: 'desc' },
        ...(limit ? { take: limit } : {}),
        select: {
          id: true,
          organizationId: true,
          targetType: true,
          targetId: true,
          kind: true,
          status: true,
          type: true,
          severity: true,
          title: true,
          message: true,
          operationKey: true,
          sourceType: true,
          sourceId: true,
          actorUserId: true,
          actionTaskId: true,
          href: true,
          progress: true,
          metadata: true,
          isRead: true,
          readAt: true,
          startedAt: true,
          finishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        kind: r.kind as AlertItem['kind'],
        status: r.status as AlertItem['status'],
        type: r.type,
        severity: r.severity,
        title: r.title,
        message: r.message,
        targetType: r.targetType,
        targetId: r.targetId,
        operationKey: r.operationKey,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        actorUserId: r.actorUserId,
        actionTaskId: r.actionTaskId,
        href: r.href,
        progress: r.progress,
        metadata: jsonObject(r.metadata),
        isRead: r.isRead,
        readAt: r.readAt instanceof Date ? r.readAt.toISOString() : r.readAt,
        startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt,
        finishedAt: r.finishedAt instanceof Date ? r.finishedAt.toISOString() : r.finishedAt,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      } satisfies AlertItem));
    } catch {
      throw new InternalServerErrorException('알림 데이터 조회 실패');
    }
  }

  async markAsRead(id: string, organizationId: string) {
    const result = await this.prisma.alert.updateMany({
      where: { id, organizationId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('알림을 찾을 수 없습니다.');

    const alert = await this.prisma.alert.findFirst({ where: { id, organizationId } });
    if (!alert) throw new NotFoundException('알림을 찾을 수 없습니다.');
    return alert;
  }

  async markAllAsRead(organizationId: string): Promise<{ updated: number }> {
    const result = await this.prisma.alert.updateMany({
      where: { organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
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
    currentUserId: string,
  ): Promise<{ task: ActionTask; updatedAlert: Alert }> {
    const result = await this.prisma.$transaction(async (tx) => {
      // organizationId scope enforced — IDOR prevention (apps/server/AGENTS.md)
      const alert = await tx.alert.findFirst({ where: { id: alertId, organizationId } });
      if (!alert) throw new NotFoundException('Alert not found');
      if (alert.actionTaskId) throw new ConflictException('Already promoted');

      let task: ActionTask;
      try {
        task = await tx.actionTask.create({
          data: {
            organizationId,
            taskKey: `promoted:${alert.id}`,
            type: 'human',
            label: alert.title,
            detail: alert.message ?? null,
            priority: input.priorityOverride ?? mapSeverityToPriority(alert.severity),
            role: input.roleOverride ?? mapAlertTypeToRole(alert.type),
            status: 'pending',
            date: kstDayStart(new Date()),
            assigneeUserId: null,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException('Already promoted (race)');
        }
        throw err;
      }

      // Atomic ownership claim — organizationId scope + null guard prevent double-promote
      const { count } = await tx.alert.updateMany({
        where: { id: alertId, organizationId, actionTaskId: null },
        data: { actionTaskId: task.id },
      });

      if (count === 0) {
        // Extreme race: P2002 didn't fire but updateMany lost the race
        await tx.actionTask.delete({ where: { id: task.id } });
        throw new ConflictException('Already promoted (race)');
      }

      return { task, updatedAlert: { ...alert, actionTaskId: task.id } };
    });

    // Emit AFTER $transaction commit — SSE subscribers observe consistent state
    try {
      const item = alertPanelMapper.mapToItem(result.updatedAlert);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, organizationId });
    } catch (err) {
      this.logger.warn('Panel emit failed after promote', err);
    }

    return result;
  }

  /**
   * Dismiss an alert — marks isRead=true and emits PANEL_EVENTS.DISMISS.
   *
   * NOT a delete: alert stays in DB. Client store removes it from live view via
   * the dismiss event. The 24h window means it continues to appear in history.
   */
  async dismiss(alertId: string, organizationId: string): Promise<void> {
    const { count } = await this.prisma.alert.updateMany({
      where: { id: alertId, organizationId }, // organizationId scope — IDOR prevention
      data: { isRead: true, readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Alert not found');

    // Emit DISMISS — client store removes item from live panel (PR1 Task 3 wire shape)
    try {
      this.eventEmitter.emit(PANEL_EVENTS.DISMISS, { itemId: alertId, organizationId });
    } catch (err) {
      this.logger.warn('Panel dismiss emit failed', err);
    }
  }
}
