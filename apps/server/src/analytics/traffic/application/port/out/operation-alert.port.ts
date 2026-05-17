export const TRAFFIC_OPERATION_ALERT_PORT = Symbol('TRAFFIC_OPERATION_ALERT_PORT');

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
  href: string | null;
  severity?: OperationAlertSeverity;
  progress?: number | null;
  metadata?: Record<string, unknown>;
}

export interface OperationLifecyclePatch {
  message?: string | null;
  href?: string | null;
  progress?: number | null;
  severity?: OperationAlertSeverity;
  metadata?: Record<string, unknown>;
}

export interface OperationAlertPort {
  start(input: StartOperationAlertInput): Promise<unknown>;
  succeed(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<unknown>;
  fail(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<unknown>;
}
