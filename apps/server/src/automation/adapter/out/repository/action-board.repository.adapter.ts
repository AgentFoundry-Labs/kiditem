// Persistence adapter for the daily action board. Owns the inventory /
// thumbnail / master-product reads that feed the warnings tile, the
// `actionTask` upsert/list/claim/unclaim path, and the batch source-alert
// lookup used by `listActionTasks`.

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActionTask, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  buildPerListingMetrics,
  type PerListingMetrics,
} from '../../../../common/per-listing-profit';
import type {
  ActionBoardRepositoryPort,
  ActionTaskClaimResult,
  ActionTaskListFilters,
  ActionTaskListItem,
  ActionTaskSourceAlert,
  AGradeReviewRow,
  InventoryReorderCandidate,
  InventoryStockRow,
  UpsertActionTaskSeed,
} from '../../../application/port/out/action-board.repository.port';

@Injectable()
export class ActionBoardRepositoryAdapter
  implements ActionBoardRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<PerListingMetrics[]> {
    return buildPerListingMetrics(
      this.prisma,
      organizationId,
      monthStart,
      monthEnd,
    );
  }

  findInventoryStockRows(
    organizationId: string,
  ): Promise<InventoryStockRow[]> {
    return this.prisma.inventory.findMany({
      where: { organizationId, currentStock: { gt: 0 } },
      select: { currentStock: true, reorderPoint: true },
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
    // 2-hop IDOR (ADR-0018 Rule 3): master.organizationId +
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

  async findInventoryReorderCandidates(
    organizationId: string,
  ): Promise<InventoryReorderCandidate[]> {
    const rows = await this.prisma.inventory.findMany({
      where: {
        organizationId,
        currentStock: { gt: 0 },
        reorderPoint: { gt: 0 },
      },
      include: {
        option: {
          include: {
            master: { select: { id: true, name: true } },
          },
        },
      },
    });
    return rows.map((inv) => ({
      masterId: inv.option?.master.id ?? inv.optionId,
      masterName: inv.option?.master.name ?? 'N/A',
      optionId: inv.optionId,
      currentStock: inv.currentStock,
      reorderPoint: inv.reorderPoint,
    } satisfies InventoryReorderCandidate));
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
        apiCall: seed.apiCall,
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
    data: Prisma.ActionTaskUpdateManyMutationInput,
  ): Promise<ActionTask> {
    const { count } = await this.prisma.actionTask.updateMany({
      where: { id, organizationId },
      data,
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
