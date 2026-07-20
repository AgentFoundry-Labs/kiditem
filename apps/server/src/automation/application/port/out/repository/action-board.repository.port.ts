// Outgoing port for the daily action board read/upsert/claim model. Joins
// inventory, master products, thumbnails, alerts, and action tasks per the
// dashboard warnings logic. The contract stays Prisma-free; repository
// adapters translate these structural records to/from the ORM.

import type { ActionTaskRecord, JsonValue } from '../../persistence-records';

export const ACTION_BOARD_REPOSITORY_PORT = Symbol(
  'ActionBoardRepositoryPort',
);

export interface AGradeReviewRow {
  reviewCount: number;
}

export interface ActionBoardPerListingMetrics {
  masterId: string;
  masterName: string;
  revenue: number;
  adCost: number;
  netProfit: number;
  profitRate: number;
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
  apiCall?: JsonValue;
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

export interface ActionTaskListItem extends ActionTaskRecord {
  assigneeUser: { id: string; name: string | null } | null;
}

export interface ActionTaskClaimResult extends ActionTaskRecord {
  assigneeUser: { id: string; name: string | null } | null;
}

export interface ActionTaskUpdateData {
  status?: string;
  priority?: string;
  notes?: JsonValue;
  activityLog?: JsonValue;
  result?: JsonValue;
}

export interface ActionBoardRepositoryPort {
  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<ActionBoardPerListingMetrics[]>;

  countOutOfStockMasterProducts(organizationId: string): Promise<number>;

  countMappingAttentionChannelSkus(organizationId: string): Promise<number>;

  countLowCtrThumbnails(organizationId: string): Promise<number>;

  findAGradeReviewCounts(organizationId: string): Promise<AGradeReviewRow[]>;

  upsertActionTaskSeed(seed: UpsertActionTaskSeed): Promise<void>;

  findActionTasksForDay(
    organizationId: string,
    date: Date,
  ): Promise<ActionTaskRecord[]>;

  findActionTaskScoped(
    id: string,
    organizationId: string,
  ): Promise<ActionTaskRecord | null>;

  /** Update the scoped action task; throws NotFoundException when missing. */
  updateActionTaskOrThrow(
    id: string,
    organizationId: string,
    data: ActionTaskUpdateData,
  ): Promise<ActionTaskRecord>;

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
