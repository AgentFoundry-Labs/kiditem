// Consumer-side port for opening operation-alert lifecycle rows from
// advertising. The owning service lives in `automation/application/service/
// operation-alert.service.ts`; advertising wraps just the surface it needs
// here so `application/service/**` can stay free of cross-owner-domain
// service imports.
//
// Transitional boundary: when automation reconstruction exposes
// `OPERATION_ALERT_PORT` from its own `application/port/in/**`, swap this
// consumer-side port for that owner-side port. The adapter file is the
// only seam that needs to change.

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
   * User-facing deep link for this operation. Producers own this value; pass
   * explicit `null` only when no meaningful user surface exists.
   */
  href: string | null;
  severity?: OperationAlertSeverity;
  progress?: number | null;
  metadata?: Record<string, unknown>;
}

export interface OperationAlertPort {
  /** Open or re-emit an operation-alert lifecycle row for advertising flows. */
  start(input: StartOperationAlertInput): Promise<void>;
}
