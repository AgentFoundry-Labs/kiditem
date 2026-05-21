// Persistence adapter for the user-facing `Alert` notification store.
// Owns the unread/read lifecycle reads + the transactional promote-to-task
// flow with race guards (P2002 on actionTask.create, atomic updateMany on
// the alert ownership claim).

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Alert, ActionTask } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { AlertItem } from '@kiditem/shared/alerts';
import type {
  AlertsRepositoryPort,
  MarkAllAlertsReadResult,
  PromoteAlertCommand,
  PromoteAlertResult,
} from '../../../application/port/out/repository/alerts.repository.port';

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class AlertsRepositoryAdapter implements AlertsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findUnreadAlerts(
    organizationId: string,
    limit?: number,
  ): Promise<AlertItem[]> {
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
  }

  async markAsRead(id: string, organizationId: string): Promise<Alert> {
    const result = await this.prisma.alert.updateMany({
      where: { id, organizationId },
      data: { isRead: true, readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('알림을 찾을 수 없습니다.');
    }
    const alert = await this.prisma.alert.findFirst({
      where: { id, organizationId },
    });
    if (!alert) throw new NotFoundException('알림을 찾을 수 없습니다.');
    return alert;
  }

  async markAllAsRead(
    organizationId: string,
  ): Promise<MarkAllAlertsReadResult> {
    const unreadAlerts = await this.prisma.alert.findMany({
      where: { organizationId, isRead: false },
    });
    if (unreadAlerts.length === 0) {
      return { updated: 0, alerts: [] };
    }
    const readAt = new Date();
    const alertIds = unreadAlerts.map((alert) => alert.id);
    const result = await this.prisma.alert.updateMany({
      where: { organizationId, id: { in: alertIds }, isRead: false },
      data: { isRead: true, readAt },
    });
    return {
      updated: result.count,
      alerts: unreadAlerts.map((alert) => ({
        ...alert,
        isRead: true,
        readAt,
      })),
    };
  }

  async promoteAlertToTask(
    command: PromoteAlertCommand,
  ): Promise<PromoteAlertResult> {
    const { alertId, organizationId, date, resolvePriority, resolveRole } = command;
    return this.prisma.$transaction(async (tx) => {
      const alert = await tx.alert.findFirst({
        where: { id: alertId, organizationId },
      });
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
            priority: command.priorityOverride ?? resolvePriority(alert),
            role: command.roleOverride ?? resolveRole(alert),
            status: 'pending',
            date,
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

      // Atomic ownership claim — organizationId scope + null guard prevent
      // double-promote even if two callers raced past the check above.
      const { count } = await tx.alert.updateMany({
        where: { id: alertId, organizationId, actionTaskId: null },
        data: { actionTaskId: task.id },
      });
      if (count === 0) {
        await tx.actionTask.delete({ where: { id: task.id } });
        throw new ConflictException('Already promoted (race)');
      }

      return { task, updatedAlert: { ...alert, actionTaskId: task.id } };
    });
  }

  async dismissAlert(id: string, organizationId: string): Promise<void> {
    const { count } = await this.prisma.alert.updateMany({
      where: { id, organizationId },
      data: { isRead: true, readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Alert not found');
  }
}
