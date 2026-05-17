// Owner-side incoming port for `Alert.kind = "operation"` lifecycle writes.
// Cross-owner-domain producers (advertising, ai, channels, finance, rules,
// sourcing, analytics/traffic) bind their consumer-side
// `adapter/out/automation/operation-alert.adapter.ts` to this token instead
// of injecting `OperationAlertService` concretely.
//
// Idempotency contract owned by the implementation:
//   - identity is `(organizationId, operationKey)`
//   - `start` upserts; `succeed`/`fail`/`progress`/`cancel` are no-ops when
//     the row does not exist (defensive producer-side calls)
//   - `closeStaleOperations` recovers operations whose producer crashed
//
// The schema-typed `Alert` row is intentionally *not* exposed here —
// publishers don't depend on the ORM. Methods return the local structural
// record used by Automation application code so repository implementation
// details stay behind outgoing adapters.

import type { AlertRecord } from '../persistence-records';

export const OPERATION_ALERT_PORT = Symbol('OperationAlertPort');

export type OperationAlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface StartOperationAlertInput {
  organizationId: string;
  operationKey: string;
  type: string;
  title: string;
  message?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /**
   * User-facing deep link for this operation. Producers own this value;
   * pass explicit `null` only when no meaningful user surface exists.
   */
  href: string | null;
  severity?: OperationAlertSeverity;
  progress?: number | null;
  metadata?: Record<string, unknown>;
}

export interface OperationLifecyclePatch {
  message?: string | null;
  /** Optional lifecycle link update when the final result URL is known. */
  href?: string | null;
  progress?: number | null;
  severity?: OperationAlertSeverity;
  /** Shallow-merged into the existing metadata JSON. */
  metadata?: Record<string, unknown>;
}

export interface CloseStaleOperationAlertsInput {
  sourceType: string;
  operationKeyPrefix: string;
  staleBefore: Date;
  status: 'failed' | 'cancelled';
  message: string;
  severity?: OperationAlertSeverity;
  metadata?: Record<string, unknown>;
  limit?: number;
}

export interface OperationAlertPort {
  /** Open or re-emit an operation-alert lifecycle row. */
  start(input: StartOperationAlertInput): Promise<AlertRecord>;

  /** Read an operation by its idempotency key. */
  findByOperationKey(
    organizationId: string,
    operationKey: string,
  ): Promise<AlertRecord | null>;

  /** Patch a running operation. No-op when the row is missing. */
  progress(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch,
  ): Promise<AlertRecord | null>;

  /** Mark a running operation succeeded. No-op when the row is missing. */
  succeed(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<AlertRecord | null>;

  /** Mark a running operation failed. Defaults severity to `error`. */
  fail(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<AlertRecord | null>;

  /** Cancel a running operation. No-op when the row is missing. */
  cancel(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<AlertRecord | null>;

  /**
   * Close the latest operation linked to a source tuple when the producer knows
   * the upstream source identity but not the operation key.
   */
  closeBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    status: 'succeeded' | 'failed' | 'cancelled',
    patch?: OperationLifecyclePatch,
  ): Promise<AlertRecord | null>;

  /**
   * Best-effort recovery for operations whose producer was process-local
   * and disappeared during deploy/restart. Filtered by producer identity.
   */
  closeStaleOperations(
    input: CloseStaleOperationAlertsInput,
  ): Promise<AlertRecord[]>;
}
