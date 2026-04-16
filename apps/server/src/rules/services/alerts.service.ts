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
import { alertPanelAdapter } from '../../panel/adapters/alert.adapter';
import { PANEL_EVENTS } from '../../panel/events/panel-events';
import type { AlertItem } from '@kiditem/shared';
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

  async findAll(limit?: number) {
    try {
      const rows = await this.prisma.alert.findMany({
        where: { isRead: false },
        orderBy: { createdAt: 'desc' },
        ...(limit ? { take: limit } : {}),
        select: {
          id: true,
          companyId: true,
          productId: true,
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

  async markAsRead(id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('알림을 찾을 수 없습니다.');
    return this.prisma.alert.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(): Promise<{ updated: number }> {
    const result = await this.prisma.alert.updateMany({
      where: { isRead: false },
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
            assigneeUserId: currentUserId,
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
      const item = alertPanelAdapter.mapToItem(result.updatedAlert);
      this.eventEmitter.emit(PANEL_EVENTS.UPSERT, { item, companyId });
    } catch (err) {
      this.logger.warn('Panel emit failed after promote', err);
    }

    return result;
  }
}
