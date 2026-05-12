// Outgoing port for the `Alert.kind = "operation"` ledger persistence.
// Wraps the idempotent upsert + lifecycle update operations the
// OperationAlertService application logic depends on. Tenant predicate is
// `organizationId` on every read/write.

import type { Alert } from '@prisma/client';

export const OPERATION_ALERT_REPOSITORY_PORT = Symbol(
  'OperationAlertRepositoryPort',
);

export interface OperationAlertCoreData {
  kind: 'operation';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string | null;
  sourceType: string | null;
  sourceId: string | null;
  actorUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  href: string | null;
  progress: number;
  metadata: Record<string, unknown>;
}

export interface OperationAlertUpsertData extends OperationAlertCoreData {
  startedAt: Date;
  finishedAt: Date | null;
  isRead: boolean;
  readAt: Date | null;
}

export interface OperationAlertTransitionPatch {
  message?: string | null;
  href?: string | null;
  progress?: number | null;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  metadata?: Record<string, unknown>;
  finishedAt: Date | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  /** Default progress applied when patch leaves progress unset. */
  progressDefault?: number;
  /** Default severity applied when patch leaves severity unset. */
  severityDefault?: 'info' | 'warning' | 'error' | 'critical';
}

export interface CloseStaleOperationsCriteria {
  sourceType: string;
  operationKeyPrefix: string;
  staleBefore: Date;
  status: 'failed' | 'cancelled';
  message: string;
  /**
   * Caller-supplied severity. When omitted, the adapter preserves each
   * row's existing severity (so a routine stale-cancel doesn't escalate
   * a previously-warning row to error).
   */
  severity?: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, unknown>;
  limit: number;
}

export interface OperationAlertRepositoryPort {
  /** Idempotent upsert keyed on `(organizationId, operationKey)`. */
  upsertByOperationKey(
    organizationId: string,
    operationKey: string,
    data: OperationAlertUpsertData,
  ): Promise<Alert>;

  /** Transition a row to a target status. Returns null when the row is missing. */
  transition(
    organizationId: string,
    operationKey: string,
    patch: OperationAlertTransitionPatch,
  ): Promise<Alert | null>;

  /** Latest row by `(organizationId, sourceType, sourceId)` for closeBySource. */
  findLatestBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<Alert | null>;

  /** Lookup by `(organizationId, operationKey)`. */
  findByOperationKey(
    organizationId: string,
    operationKey: string,
  ): Promise<Alert | null>;

  /** Batch close stale operation rows matching the criteria. */
  closeStaleOperations(criteria: CloseStaleOperationsCriteria): Promise<Alert[]>;
}
