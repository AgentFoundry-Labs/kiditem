export type CancelOperationTarget =
  | { targetType: 'operation_key'; operationKey: string; reason?: string }
  | { targetType: 'workflow_run'; runId: string; reason?: string }
  | { targetType: 'agent_run_request'; requestId: string; reason?: string }
  | { targetType: 'agent_run'; runId: string; reason?: string }
  | { targetType: 'content_generation'; generationId: string; reason?: string }
  | { targetType: 'thumbnail_generation'; generationId: string; reason?: string };

export type CancelOperationStatus =
  | 'cancelled'
  | 'already_terminal'
  | 'not_cancellable';

export interface CancelOperationAffected {
  workflowRunIds: string[];
  agentRunRequestIds: string[];
  agentRunIds: string[];
  contentGenerationIds: string[];
  thumbnailGenerationIds: string[];
}

export interface CancelOperationPreserved {
  contentGenerationIds: string[];
  thumbnailGenerationIds: string[];
}

export interface CancelOperationCommand {
  organizationId: string;
  actorUserId: string | null;
  target: CancelOperationTarget;
}

export interface CancelOperationResult {
  ok: true;
  status: CancelOperationStatus;
  message: string;
  operationKey: string | null;
  affected: CancelOperationAffected;
  preserved: CancelOperationPreserved;
  warnings: string[];
}

export function emptyAffected(): CancelOperationAffected {
  return {
    workflowRunIds: [],
    agentRunRequestIds: [],
    agentRunIds: [],
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}

export function emptyPreserved(): CancelOperationPreserved {
  return {
    contentGenerationIds: [],
    thumbnailGenerationIds: [],
  };
}
