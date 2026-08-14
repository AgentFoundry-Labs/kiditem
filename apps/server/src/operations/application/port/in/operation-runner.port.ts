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

export interface ResumeOperationRunCommand {
  organizationId: string;
  runId: string;
  requestedByUserId: string | null;
}

export interface OperationRunnerPort {
  start(command: StartOperationCommand): Promise<OperationRun>;
  list(query: ListOperationRunsQuery): Promise<OperationRun[]>;
  get(organizationId: string, runId: string): Promise<OperationRun>;
  resume(command: ResumeOperationRunCommand): Promise<OperationRun>;
  cancel(command: CancelOperationRunCommand): Promise<OperationRun>;
}
