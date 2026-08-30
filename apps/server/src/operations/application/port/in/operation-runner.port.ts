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
  /** Generic runner access is restricted to retained operation definitions. */
  start(command: StartOperationCommand): Promise<OperationRun>;
  /** Resolves an immutable idempotent operation result before mutable owner shortcuts. */
  findByIdempotency(input: {
    organizationId: string;
    operationKey: string;
    idempotencyKey: string;
    /** Fail closed when the durable receipt belongs to a different canonical input. */
    expectedInput?: Record<string, unknown>;
  }): Promise<OperationRun | null>;
  list(query: ListOperationRunsQuery): Promise<OperationRun[]>;
  findReconnectable(input: {
    organizationId: string;
    requestedByUserId: string;
    operationKey: string;
    /** Exact static input may disambiguate; omitted dynamic forms require one candidate. */
    input?: Record<string, unknown>;
  }): Promise<OperationRun | null>;
  get(organizationId: string, runId: string): Promise<OperationRun>;
  cancel(command: CancelOperationRunCommand): Promise<OperationRun>;
}
