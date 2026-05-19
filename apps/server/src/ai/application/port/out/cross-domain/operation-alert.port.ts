export const AI_OPERATION_ALERT_PORT = Symbol('AI_OPERATION_ALERT_PORT');

export type OperationAlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type OperationAlertCloseStatus = 'succeeded' | 'failed' | 'cancelled';

export interface OperationAlertRecord {
  id: string;
  organizationId: string;
  operationKey: string | null;
  status: string;
  progress: number | null;
  metadata: unknown;
}

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
  start(input: StartOperationAlertInput): Promise<OperationAlertRecord>;
  findByOperationKey(
    organizationId: string,
    operationKey: string,
  ): Promise<OperationAlertRecord | null>;
  progress(
    organizationId: string,
    operationKey: string,
    patch: OperationLifecyclePatch,
  ): Promise<OperationAlertRecord | null>;
  succeed(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<OperationAlertRecord | null>;
  fail(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<OperationAlertRecord | null>;
  cancel(
    organizationId: string,
    operationKey: string,
    patch?: OperationLifecyclePatch,
  ): Promise<OperationAlertRecord | null>;
  closeBySource(
    organizationId: string,
    sourceType: string,
    sourceId: string,
    status: OperationAlertCloseStatus,
    patch?: OperationLifecyclePatch,
  ): Promise<OperationAlertRecord | null>;
  closeStaleOperations(
    input: CloseStaleOperationAlertsInput,
  ): Promise<OperationAlertRecord[]>;
}
