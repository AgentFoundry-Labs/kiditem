// Persistence adapter for the daily action board. Owns the inventory /
// thumbnail / master-product reads that feed the warnings tile, the
// `actionTask` upsert/list/claim/unclaim path, and the batch source-alert
// lookup used by `listActionTasks`.

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActionTask } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../../common/per-listing-profit';
import type {
  ActionBoardPerListingMetrics,
  ActionBoardRepositoryPort,
  ActionTaskClaimResult,
  ActionTaskListFilters,
  ActionTaskListItem,
  ActionTaskSourceAlert,
  ActionTaskUpdateData,
  AGradeReviewRow,
  UpsertActionTaskSeed,
} from '../../../application/port/out/repository/action-board.repository.port';
import type { JsonValue } from '../../../application/port/persistence-records';

function toPrismaJson(value: JsonValue) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class ActionBoardRepositoryAdapter
  implements ActionBoardRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<ActionBoardPerListingMetrics[]> {
    return buildPerListingMetrics(
      this.prisma,
      organizationId,
      monthStart,
      monthEnd,
    );
  }

  countOutOfStockInventorySkus(organizationId: string): Promise<number> {
    return this.prisma.inventorySku.count({
      where: { organizationId, currentStock: 0 },
    });
  }

  countMappingAttentionChannelSkus(organizationId: string): Promise<number> {
    return this.prisma.channelListingOption.count({
      where: {
        organizationId,
        isActive: true,
        components: { none: {} },
        channelAccount: { is: { organizationId } },
        listing: { is: { organizationId, isDeleted: false } },
      },
    });
  }

  countLowCtrThumbnails(organizationId: string): Promise<number> {
    return this.prisma.thumbnail.count({
      where: { organizationId, ctr: { gt: 0, lt: 1.5 } },
    });
  }

  async findAGradeReviewCounts(
    organizationId: string,
  ): Promise<AGradeReviewRow[]> {
    // 2-hop tenant scope: master.organizationId +
    // listings.organizationId on the nested filter.
    const masters = await this.prisma.masterProduct.findMany({
      where: { organizationId, isDeleted: false, abcGrade: 'A' },
      include: {
        listings: {
          where: { organizationId, isDeleted: false },
          select: { _count: { select: { reviews: true } } },
        },
      },
    });
    return masters.map((m) => ({
      reviewCount: m.listings.reduce(
        (sum, l) => sum + l._count.reviews,
        0,
      ),
    } satisfies AGradeReviewRow));
  }

  async upsertActionTaskSeed(seed: UpsertActionTaskSeed): Promise<void> {
    await this.prisma.actionTask.upsert({
      where: {
        organizationId_taskKey_date: {
          organizationId: seed.organizationId,
          taskKey: seed.taskKey,
          date: seed.date,
        },
      },
      create: {
        organizationId: seed.organizationId,
        taskKey: seed.taskKey,
        type: seed.type,
        label: seed.label,
        detail: seed.detail ?? null,
        where: seed.where ?? null,
        href: seed.href ?? null,
        priority: seed.priority,
        role: seed.role ?? null,
        apiCall:
          seed.apiCall === undefined
            ? Prisma.JsonNull
            : toPrismaJson(seed.apiCall),
        date: seed.date,
      },
      update: {
        label: seed.label,
        detail: seed.detail ?? null,
        priority: seed.priority,
      },
    });
  }

  findActionTasksForDay(
    organizationId: string,
    date: Date,
  ): Promise<ActionTask[]> {
    return this.prisma.actionTask.findMany({
      where: { organizationId, date },
      orderBy: { createdAt: 'asc' },
    });
  }

  findActionTaskScoped(
    id: string,
    organizationId: string,
  ): Promise<ActionTask | null> {
    return this.prisma.actionTask.findFirst({
      where: { id, organizationId },
    });
  }

  async updateActionTaskOrThrow(
    id: string,
    organizationId: string,
    data: ActionTaskUpdateData,
  ): Promise<ActionTask> {
    const updateData: Prisma.ActionTaskUpdateManyMutationInput = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.notes !== undefined) updateData.notes = toPrismaJson(data.notes);
    if (data.activityLog !== undefined) {
      updateData.activityLog = toPrismaJson(data.activityLog);
    }
    if (data.result !== undefined) updateData.result = toPrismaJson(data.result);

    const { count } = await this.prisma.actionTask.updateMany({
      where: { id, organizationId },
      data: updateData,
    });
    if (count === 0) throw new NotFoundException('Task not found');
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id, organizationId },
    });
  }

  async claimActionTask(
    taskId: string,
    organizationId: string,
    userId: string,
  ): Promise<ActionTaskClaimResult> {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, organizationId, assigneeUserId: null },
      data: { assigneeUserId: userId },
    });
    if (count === 0) {
      throw new ConflictException('Already claimed or task not found');
    }
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id: taskId, organizationId },
      include: { assigneeUser: { select: { id: true, name: true } } },
    });
  }

  async unclaimActionTask(
    taskId: string,
    organizationId: string,
    userId: string,
  ): Promise<ActionTaskClaimResult> {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id: taskId, organizationId, assigneeUserId: userId },
      data: { assigneeUserId: null },
    });
    if (count === 0) {
      throw new ConflictException('Not assigned to you or task not found');
    }
    return this.prisma.actionTask.findFirstOrThrow({
      where: { id: taskId, organizationId },
      include: { assigneeUser: { select: { id: true, name: true } } },
    });
  }

  async listActionTasks(
    organizationId: string,
    filters: ActionTaskListFilters,
  ): Promise<ActionTaskListItem[]> {
    const { assignedTo, currentUserId } = filters;
    const where: Prisma.ActionTaskWhereInput = { organizationId };
    if (assignedTo === 'me') {
      where.assigneeUserId = currentUserId;
    } else if (assignedTo === 'team') {
      where.AND = [
        { assigneeUserId: { not: null } },
        { assigneeUserId: { not: currentUserId } },
      ];
    }

    return this.prisma.actionTask.findMany({
      where,
      include: { assigneeUser: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { date: 'desc' }],
    });
  }

  async findAlertsByTaskIds(
    organizationId: string,
    taskIds: string[],
  ): Promise<ActionTaskSourceAlert[]> {
    if (taskIds.length === 0) return [];
    return this.prisma.alert.findMany({
      where: { organizationId, actionTaskId: { in: taskIds } },
      select: {
        id: true,
        actionTaskId: true,
        severity: true,
        type: true,
        title: true,
      },
    });
  }
}
