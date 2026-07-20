import type {
  AiDirectJobEnvelope,
  AiDirectJobStatus,
  AiDirectJobType,
} from '../../../../domain/direct-job/ai-direct-job.schema';

export const AI_DIRECT_JOB_REPOSITORY_PORT = Symbol(
  'AI_DIRECT_JOB_REPOSITORY_PORT',
);

export interface AiDirectJobRecord {
  id: string;
  organizationId: string;
  jobType: AiDirectJobType;
  sourceResourceId: string;
  status: AiDirectJobStatus;
  payload: AiDirectJobEnvelope;
  result: unknown;
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  leaseExpiresAt: Date | null;
  finishedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiDirectJobWriteScope {
  aiDirectJob: {
    create(args: unknown): Promise<unknown>;
  };
}

export interface CreateAiDirectJobInput {
  id?: string;
  organizationId: string;
  jobType: AiDirectJobType;
  sourceResourceId: string;
  payload: AiDirectJobEnvelope;
  status: 'held';
  scheduledFor: Date;
  maxAttempts?: number;
}

export interface FailOrRescheduleAiDirectJobInput {
  organizationId: string;
  jobId: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  retryAt: Date;
  now: Date;
}

export interface AiDirectJobRepositoryPort {
  create(input: CreateAiDirectJobInput): Promise<AiDirectJobRecord>;
  createInScope(
    scope: AiDirectJobWriteScope,
    input: CreateAiDirectJobInput,
  ): Promise<AiDirectJobRecord>;
  restartHeldReedit(input: CreateAiDirectJobInput & { jobType: 'thumbnail_reedit' }): Promise<AiDirectJobRecord>;
  release(input: { organizationId: string; jobId: string }): Promise<boolean>;
  claimNext(input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
  }): Promise<
    (AiDirectJobRecord & { claimedFromStatus: AiDirectJobStatus }) | null
  >;
  checkpointResult(input: {
    organizationId: string;
    jobId: string;
    result: unknown;
  }): Promise<boolean>;
  extendLease(input: {
    organizationId: string;
    jobId: string;
    workerId: string;
    leaseExpiresAt: Date;
  }): Promise<'running' | 'projecting' | 'cancelled' | 'lost'>;
  markSucceeded(input: {
    organizationId: string;
    jobId: string;
  }): Promise<boolean>;
  failOrReschedule(input: FailOrRescheduleAiDirectJobInput): Promise<void>;
  cancel(input: {
    organizationId: string;
    jobId: string;
    reason: string;
  }): Promise<AiDirectJobRecord | null>;
  cancelBySource(input: {
    organizationId: string;
    sourceResourceId: string;
    jobTypes: AiDirectJobType[];
    reason: string;
  }): Promise<number>;
  findById(input: {
    organizationId: string;
    jobId: string;
  }): Promise<AiDirectJobRecord | null>;
}
