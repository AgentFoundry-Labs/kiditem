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
import { PrismaService } from '../../prisma/prisma.service';
import { kstDayStart } from '../../common/kst';
import { alertPanelMapper } from '../../automation/mapper/panel-event/alert.mapper';
import { PANEL_EVENTS } from '../../automation/adapter/out/panel-event/panel-events';
import type { AlertItem } from '@kiditem/shared/alerts';
import type { PromoteAlertDto } from '../dto';

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
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(companyId: string, limit?: number) {
    try {
      const rows = await this.prisma.alert.findMany({
        where: { companyId, isRead: false },
        orderBy: { createdAt: 'desc' },
        ...(limit ? { take: limit } : {}),
        select: {
          id: true,
          companyId: true,
          targetType: true,
          targetId: true,
          type: true,
          severity: true,
          title: true,
          message: true,
          isRead: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      } satisfies AlertItem));
    } catch {
      throw new InternalServerErrorException('알림 데이터 조회 실패');
    }
  }

  async markAsRead(id: string, companyId: string) {
    const result = await this.prisma.alert.updateMany({
      where: { id, companyId },
      data: { isRead: true },
    });
    if (result.count === 0) throw new NotFoundException('알림을 찾을 수 없습니다.');

    const alert = await this.prisma.alert.findFirst({ where: { id, companyId } });
    if (!alert) throw new NotFoundException('알림을 찾을 수 없습니다.');
    return alert;
  }

  async markAllAsRead(companyId: string): Promise<{ updated: number }> {
    const result = await this.prisma.alert.updateMany({
      where: { companyId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  /**
   * Promote an alert to an ActionTask atomically.
   *
   * Race guard:
   *  1. findFirst + actionTaskId != null check → ConflictException (already promoted)
   *  2. actionTask.create inside $transaction — @@unique([companyId, taskKey, date])
   *     P2002 on create → ConflictException('Already promoted (race)')
   *  3. alert.updateMany with companyId + actionTaskId: null — atomic ownership claim
   *     count=0 → rollback (delete task) + ConflictException
   *
   * Emit is OUTSIDE $transaction: guaranteed to fire only after commit so SSE
   * subscribers observe a consistent DB state.
   */
  async promote(
    alertId: string,
    companyId: string,
    dto: PromoteAlertDto,
    currentUserId: string,
  ): Promise<{ task: ActionTask; updatedAlert: Alert }> {
    const result = await this.prisma.$transaction(async (tx) => {
      // companyId scope enforced — IDOR prevention (apps/server CLAUDE.md)
      const alert = await tx.alert.findFirst({ where: { id: alertId, companyId } });
      if (!alert) throw new NotFoundException('Alert not found');
      if (alert.actionTaskId) throw new ConflictException('Already promoted');

      let task: ActionTask;
      try {
        task = await tx.actionTask.create({
          data: {
            companyId,
            taskKey: `promoted:${alert.id}`,
            type: 'human',
            label: alert.title,
            detail: alert.message ?? null,
            priority: dto.priorityOverride ?? mapSeverityToPriority(alert.severity),
            role: dto.roleOverride ?? mapAlertTypeToRole(alert.type),
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

      // Atomic ownership claim — companyId scope + null guard prevent double-promote
      const { count } = await tx.alert.updateMany({
        where: { id: alertId, companyId, actionTaskId: null },
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
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId });
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
  async dismiss(alertId: string, companyId: string): Promise<void> {
    const { count } = await this.prisma.alert.updateMany({
      where: { id: alertId, companyId }, // companyId scope — IDOR prevention
      data: { isRead: true },
    });
    if (count === 0) throw new NotFoundException('Alert not found');

    // Emit DISMISS — client store removes item from live panel (PR1 Task 3 wire shape)
    try {
      this.eventEmitter.emit(PANEL_EVENTS.DISMISS, { itemId: alertId, companyId });
    } catch (err) {
      this.logger.warn('Panel dismiss emit failed', err);
    }
  }
}
