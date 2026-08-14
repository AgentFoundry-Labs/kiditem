import type {
  OperationEngineType,
  OperationResourceClass,
  OperationStage,
  OperationStatus,
  OperationTriggerSource,
} from '@kiditem/shared/operations';
import type {
  ActiveBrowserAttemptTransaction,
  ActiveOperationAttemptTransaction,
} from '../../active-browser-attempt-transaction';

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
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
  status: OperationStatus;
  triggerSource: OperationTriggerSource;
  requestedByUserId: string | null;
  parentRunId: string | null;
  scheduleId: string | null;
  idempotencyKey: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  progress: number | null;
  stage: OperationStage | null;
  stageUpdatedAt: Date | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  deadlineAt: Date | null;
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

export interface ActiveBrowserOperationAttemptRecord {
  runId: string;
  organizationId: string;
  operationKey: string;
  engineType: OperationEngineType;
  status: OperationStatus;
  attemptToken: string;
  input: Record<string, unknown>;
  requestedByUserId: string | null;
  startedAt: Date;
  leaseExpiresAt: Date;
  deadlineAt: Date;
}

export type ActiveDomainOperationAttemptRecord = ActiveBrowserOperationAttemptRecord;

export interface CreateOperationRunRecord {
  signal: AbortSignal;
  organizationId: string;
  operationKey: string;
  definitionVersion: number;
  ownerDomain: string;
  title: string;
  engineType: OperationEngineType;
  resourceClass: OperationResourceClass;
  executionTimeoutMs: number;
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
  signal?: AbortSignal;
  organizationId: string;
  runId: string;
  expectedStatuses: readonly OperationStatus[];
  status: OperationStatus;
  progress?: number | null;
  stage?: OperationStage | null;
  progressCurrent?: number | null;
  progressTotal?: number | null;
  deadlineAt?: Date | null;
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
}

export type OperationActiveAttemptTransition = Pick<
  OperationRunTransition,
  | 'organizationId'
  | 'runId'
  | 'expectedStatuses'
  | 'status'
  | 'progress'
  | 'stage'
  | 'progressCurrent'
  | 'progressTotal'
  | 'result'
  | 'nativeRunType'
  | 'nativeRunId'
  | 'errorCode'
  | 'errorMessage'
  | 'finishedAt'
  | 'claimedBy'
  | 'attemptToken'
  | 'claimedAt'
  | 'leaseExpiresAt'
> & { expectedAttemptToken: string };

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

export interface OperationLifecycleBatchResult {
  updated: number;
  remaining: boolean;
}

export interface OperationCompositeCancellationResult {
  parent: OperationRunRecord;
  children: OperationRunRecord[];
}

export interface OperationRunRepositoryPort {
  withActiveBrowserAttemptFence<T>(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }, operation: (
    attempt: ActiveBrowserOperationAttemptRecord,
    transaction: ActiveBrowserAttemptTransaction,
  ) => Promise<T>): Promise<T | null>;
  withActiveDomainAttemptFence<T>(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
  }, operation: (
    attempt: ActiveDomainOperationAttemptRecord,
    transaction: ActiveOperationAttemptTransaction,
  ) => Promise<T>): Promise<T | null>;
  findActiveBrowserAttempt(input: {
    organizationId: string;
    runId: string;
    expectedOperationKey: string;
    attemptToken: string;
    now: Date;
  }): Promise<ActiveBrowserOperationAttemptRecord | null>;
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
  createChildAndWaitForDependency(input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    child: Omit<CreateOperationRunRecord, 'signal'>;
  }): Promise<OperationRunRecord | null>;
  createChildrenAndWaitForDependencies(input: {
    signal: AbortSignal;
    parentOrganizationId: string;
    parentRunId: string;
    expectedAttemptToken: string;
    children: Array<Omit<CreateOperationRunRecord, 'signal'>>;
  }): Promise<OperationRunRecord[] | null>;
  cancelRunAndActiveChildren(input: {
    signal: AbortSignal;
    organizationId: string;
    parentRunId: string;
    parentErrorCode: string | null;
    parentErrorMessage: string | null;
    childErrorCode: string;
    childErrorMessage: string;
    finishedAt: Date;
  }): Promise<OperationCompositeCancellationResult | null>;
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
  transitionActiveAttempt(
    input: OperationActiveAttemptTransition,
  ): Promise<OperationRunRecord | null>;
  claimNextRun(input: {
    resourceClass: OperationResourceClass;
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    signal: AbortSignal;
  }): Promise<OperationRunRecord | null>;
  readLifecycleDatabaseTime(): Promise<Date>;
  cancelRunsForLifecycle(input: {
    cutoff: Date | null;
    errorCode:
      | 'operation_server_shutdown'
      | 'operation_server_lifecycle_expired';
    errorMessage: string;
    finishedAt: Date;
    limit: number;
    statementTimeoutMs: number;
  }): Promise<OperationLifecycleBatchResult>;
  advanceSchedulesPastLifecycleCutoff(input: {
    cutoff: Date;
    limit: number;
    statementTimeoutMs: number;
  }): Promise<OperationLifecycleBatchResult>;
  cancelClaimedAttemptForLifecycle(input: {
    organizationId: string;
    runId: string;
    expectedAttemptToken: string;
    claimedBy: string;
    errorCode: 'operation_server_shutdown';
    finishedAt: Date;
  }): Promise<boolean>;
  cancelExpiredWorkerAttempts(input: {
    now: Date;
    limit: number;
  }): Promise<number>;
  heartbeatRun(input: {
    organizationId: string;
    runId: string;
    attemptToken: string;
    now: Date;
    leaseExpiresAt: Date;
    stage?: OperationStage | null;
    progressCurrent?: number | null;
    progressTotal?: number | null;
  }): Promise<OperationRunRecord | null>;
  expirePastDeadlineRuns(input: {
    now: Date;
    limit: number;
  }): Promise<number>;
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
    signal: AbortSignal;
    organizationId: string;
    runtimeId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<OperationRunRecord | null>;
  heartbeatBrowserRun(input: {
    signal: AbortSignal;
    organizationId: string;
    runId: string;
    attemptToken: string;
    leaseDurationMs: number;
    progress?: number | null;
    stage?: OperationStage | null;
    progressCurrent?: number | null;
    progressTotal?: number | null;
  }): Promise<OperationRunRecord | null>;
}
