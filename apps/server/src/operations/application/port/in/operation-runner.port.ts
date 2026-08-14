import type {
  OperationRun,
  OperationStatus,
  OperationTriggerSource,
} from '@kiditem/shared/operations';

export const OPERATION_RUNNER_PORT = Symbol('OPERATION_RUNNER_PORT');

export interface StartOperationCommand {
  organizationId: string;
  operationKey: string;
  triggerSource: OperationTriggerSource;
  input: Record<string, unknown>;
  requestedByUserId: string | null;
  idempotencyKey: string | null;
  parentRunId?: string | null;
  scheduleId?: string | null;
  scheduledFor?: Date | null;
}

export interface ListOperationRunsQuery {
  organizationId: string;
  status?: OperationStatus;
  limit?: number;
}

export interface CancelOperationRunCommand {
  organizationId: string;
  runId: string;
  requestedByUserId: string | null;
  reason?: string | null;
}

export interface OperationRunnerPort {
  start(command: StartOperationCommand): Promise<OperationRun>;
  list(query: ListOperationRunsQuery): Promise<OperationRun[]>;
  findReconnectable(input: {
    organizationId: string;
    operationKey: string;
    input: Record<string, unknown>;
  }): Promise<OperationRun | null>;
  get(organizationId: string, runId: string): Promise<OperationRun>;
  cancel(command: CancelOperationRunCommand): Promise<OperationRun>;
}
