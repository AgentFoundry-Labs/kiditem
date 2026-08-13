import type {
  OperationEngineType,
  OperationStatus,
  OperationTriggerSource,
} from '@kiditem/shared/operations';

export const OPERATION_REPOSITORY_PORT = Symbol('OPERATION_REPOSITORY_PORT');

export interface OperationRunActorRecord {
  id: string;
  name: string;
  email: string;
}

export interface OperationRunRecord {
  id: string;
  organizationId: string;
  operationKey: string;
  definitionVersion: number;
  ownerDomain: string;
  title: string;
  engineType: OperationEngineType;
  status: OperationStatus;
  triggerSource: OperationTriggerSource;
  requestedByUserId: string | null;
  parentRunId: string | null;
  scheduleId: string | null;
  idempotencyKey: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  progress: number | null;
  nativeRunType: string | null;
  nativeRunId: string | null;
  attempts: number;
  maxAttempts: number;
  claimedBy: string | null;
  attemptToken: string | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  scheduledFor: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requestedBy: OperationRunActorRecord | null;
}

export interface CreateOperationRunRecord {
  organizationId: string;
  operationKey: string;
  definitionVersion: number;
  ownerDomain: string;
  title: string;
  engineType: OperationEngineType;
  triggerSource: OperationTriggerSource;
  requestedByUserId: string | null;
  parentRunId: string | null;
  scheduleId: string | null;
  idempotencyKey: string | null;
  input: Record<string, unknown>;
  maxAttempts: number;
  scheduledFor: Date | null;
}

export interface OperationRunTransition {
  organizationId: string;
  runId: string;
  expectedStatuses: readonly OperationStatus[];
  status: OperationStatus;
  progress?: number | null;
  result?: Record<string, unknown> | null;
  nativeRunType?: string | null;
  nativeRunId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  claimedBy?: string | null;
  attemptToken?: string | null;
  claimedAt?: Date | null;
  leaseExpiresAt?: Date | null;
  expectedAttemptToken?: string | null;
  attemptDelta?: number;
}

export interface OperationScheduleRecord {
  id: string;
  organizationId: string;
  operationKey: string;
  cronExpression: string;
  timeZone: string;
  misfirePolicy: 'skip' | 'catch_up_once';
  input: Record<string, unknown>;
  enabled: boolean;
  nextRunAt: Date | null;
  lastScheduledFor: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertOperationScheduleRecord {
  organizationId: string;
  operationKey: string;
  cronExpression: string;
  timeZone: string;
  misfirePolicy: 'skip' | 'catch_up_once';
  input: Record<string, unknown>;
  enabled: boolean;
  nextRunAt: Date | null;
  createdByUserId: string;
}

export interface OperationRunRepositoryPort {
  findRunById(input: {
    organizationId: string;
    runId: string;
  }): Promise<OperationRunRecord | null>;
  findByIdempotencyKey(input: {
    organizationId: string;
    operationKey: string;
    idempotencyKey: string;
  }): Promise<OperationRunRecord | null>;
  createRun(input: CreateOperationRunRecord): Promise<OperationRunRecord>;
  listRuns(input: {
    organizationId: string;
    status?: OperationStatus;
    limit: number;
  }): Promise<OperationRunRecord[]>;
  listChildRuns(input: {
    organizationId: string;
    parentRunId: string;
  }): Promise<OperationRunRecord[]>;
  listWaitingDependencyParents(input: {
    limit: number;
  }): Promise<OperationRunRecord[]>;
  transition(input: OperationRunTransition): Promise<OperationRunRecord | null>;
  claimNextRun(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OperationRunRecord | null>;
  listSchedules(input: {
    organizationId: string;
  }): Promise<OperationScheduleRecord[]>;
  findSchedule(input: {
    organizationId: string;
    operationKey: string;
  }): Promise<OperationScheduleRecord | null>;
  upsertSchedule(
    input: UpsertOperationScheduleRecord,
  ): Promise<OperationScheduleRecord>;
  disableSchedule(input: {
    organizationId: string;
    operationKey: string;
  }): Promise<OperationScheduleRecord | null>;
  findDueSchedules(input: {
    now: Date;
    limit: number;
  }): Promise<OperationScheduleRecord[]>;
  advanceDueSchedule(input: {
    organizationId: string;
    scheduleId: string;
    expectedNextRunAt: Date;
    nextRunAt: Date;
  }): Promise<boolean>;
  claimNextBrowserRun(input: {
    organizationId: string;
    runtimeId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OperationRunRecord | null>;
  heartbeatBrowserRun(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    now: Date;
    leaseExpiresAt: Date;
    progress?: number | null;
  }): Promise<OperationRunRecord | null>;
  heartbeatRun?(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<boolean>;
}
