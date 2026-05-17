import type { Prisma } from '@prisma/client';

export interface OperationCancellationAffectedAudit {
  workflowRunIds: string[];
  agentRunRequestIds: string[];
  agentRunIds: string[];
  contentGenerationIds: string[];
  thumbnailGenerationIds: string[];
}

export interface OperationCancellationPreservedAudit {
  contentGenerationIds: string[];
  thumbnailGenerationIds: string[];
}

export type OperationCancellationTargetAudit =
  | { targetType: 'operation_key'; operationKey: string }
  | { targetType: 'workflow_run'; runId: string }
  | { targetType: 'agent_run_request'; requestId: string }
  | { targetType: 'agent_run'; runId: string }
  | { targetType: 'content_generation'; generationId: string }
  | { targetType: 'thumbnail_generation'; generationId: string };

export interface OperationCancellationAuditInput {
  requestedByUserId: string | null;
  reason: string;
  target: OperationCancellationTargetAudit;
  result: string;
  requestedAt?: Date;
  affected?: Partial<OperationCancellationAffectedAudit>;
  preserved?: Partial<OperationCancellationPreservedAudit>;
}

export interface OperationCancellationAuditShape {
  requestedByUserId: string | null;
  requestedAt: string;
  reason: string;
  target: OperationCancellationTargetAudit;
  affected: OperationCancellationAffectedAudit;
  preserved: OperationCancellationPreservedAudit;
  result: string;
}

export type OperationCancellationAudit = Prisma.InputJsonObject;

export function emptyOperationCancellationAffected(): OperationCancellationAffectedAudit {
  return {
    workflowRunIds: [],
    agentRunRequestIds: [],
    agentRunIds: [],
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}

export function emptyOperationCancellationPreserved(): OperationCancellationPreservedAudit {
  return {
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}

export function operationCancellationAudit(
  input: OperationCancellationAuditInput,
): OperationCancellationAudit {
  const affected: OperationCancellationAffectedAudit = {
    workflowRunIds: input.affected?.workflowRunIds ?? [],
    agentRunRequestIds: input.affected?.agentRunRequestIds ?? [],
    agentRunIds: input.affected?.agentRunIds ?? [],
    contentGenerationIds: input.affected?.contentGenerationIds ?? [],
    thumbnailGenerationIds: input.affected?.thumbnailGenerationIds ?? [],
  };
  const preserved: OperationCancellationPreservedAudit = {
    contentGenerationIds: input.preserved?.contentGenerationIds ?? [],
    thumbnailGenerationIds: input.preserved?.thumbnailGenerationIds ?? [],
  };
  const audit: OperationCancellationAuditShape = {
    requestedByUserId: input.requestedByUserId,
    requestedAt: (input.requestedAt ?? new Date()).toISOString(),
    reason: input.reason,
    target: input.target,
    affected,
    preserved,
    result: input.result,
  };
  return audit as unknown as Prisma.InputJsonObject;
}

export function asPlainRecord(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}
