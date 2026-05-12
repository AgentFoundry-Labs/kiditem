// Outgoing port for the daily action board read/upsert/claim model. Joins
// inventory, master products, thumbnails, alerts, and action tasks per the
// dashboard warnings logic — analytics/dashboard exposes the same source
// rows through its own port, but each owner owns its own port surface.

import type { ActionTask, Prisma } from '@prisma/client';
import type { PerListingMetrics } from '../../../../common/per-listing-profit';

export const ACTION_BOARD_REPOSITORY_PORT = Symbol(
  'ActionBoardRepositoryPort',
);

export interface InventoryStockRow {
  currentStock: number;
  reorderPoint: number;
}

export interface AGradeReviewRow {
  reviewCount: number;
}

export interface InventoryReorderCandidate {
  masterId: string;
  masterName: string;
  optionId: string;
  currentStock: number;
  reorderPoint: number;
}

export interface UpsertActionTaskSeed {
  organizationId: string;
  taskKey: string;
  type: string;
  label: string;
  detail?: string | null;
  where?: string | null;
  href?: string | null;
  priority: string;
  role?: string | null;
  apiCall?: Prisma.InputJsonValue;
  date: Date;
}

export interface ActionTaskSourceAlert {
  id: string;
  actionTaskId: string | null;
  severity: string;
  type: string;
  title: string;
}

export interface ActionTaskListFilters {
  assignedTo: 'me' | 'team' | 'all';
  currentUserId: string;
}

export interface ActionTaskListItem extends ActionTask {
  assigneeUser: { id: string; name: string | null } | null;
}

export interface ActionTaskClaimResult extends ActionTask {
  assigneeUser: { id: string; name: string | null } | null;
}

export interface ActionBoardRepositoryPort {
  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<PerListingMetrics[]>;

  findInventoryStockRows(organizationId: string): Promise<InventoryStockRow[]>;

  countLowCtrThumbnails(organizationId: string): Promise<number>;

  findAGradeReviewCounts(organizationId: string): Promise<AGradeReviewRow[]>;

  findInventoryReorderCandidates(
    organizationId: string,
  ): Promise<InventoryReorderCandidate[]>;

  upsertActionTaskSeed(seed: UpsertActionTaskSeed): Promise<void>;

  findActionTasksForDay(
    organizationId: string,
    date: Date,
  ): Promise<ActionTask[]>;

  findActionTaskScoped(
    id: string,
    organizationId: string,
  ): Promise<ActionTask | null>;

  /** Update the scoped action task; throws NotFoundException when missing. */
  updateActionTaskOrThrow(
    id: string,
    organizationId: string,
    data: Prisma.ActionTaskUpdateManyMutationInput,
  ): Promise<ActionTask>;

  /** Claim atomically — fails with ConflictException when already claimed. */
  claimActionTask(
    taskId: string,
    organizationId: string,
    userId: string,
  ): Promise<ActionTaskClaimResult>;

  /** Unclaim atomically — fails with ConflictException when not assigned to user. */
  unclaimActionTask(
    taskId: string,
    organizationId: string,
    userId: string,
  ): Promise<ActionTaskClaimResult>;

  listActionTasks(
    organizationId: string,
    filters: ActionTaskListFilters,
  ): Promise<ActionTaskListItem[]>;

  /** Batch-load source alerts keyed by `actionTaskId`. */
  findAlertsByTaskIds(
    organizationId: string,
    taskIds: string[],
  ): Promise<ActionTaskSourceAlert[]>;
}
