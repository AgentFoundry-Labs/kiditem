import type { z } from 'zod';
import type { InteractionUiResult } from '@kiditem/shared/agent-interaction';
import type {
  AgentExecutionAttemptName,
  AgentExecutionName,
  AgentSessionName,
  AgentSessionTaskName,
  AgentVersionName,
  OrganizationName,
  OperationRunName,
  RequestId,
  UserName,
} from '@kiditem/shared/identifiers';

export type AgentCapabilityExecutionKind =
  | 'tool'
  | 'workflow'
  | 'job_trigger'
  | 'scorer';

export type AgentCapabilitySideEffect =
  | 'read'
  | 'db_write'
  | 'external_io'
  | 'external_write'
  | 'browser'
  | 'job_enqueue';

export type AgentCapabilityApprovalRisk = 'none' | 'low' | 'medium' | 'high';

export interface AgentCapabilityArtifactOutput {
  artifactType: string;
  targetDomain: string;
  targetModel: string;
  targetId?: string | null;
  title: string;
  href?: string | null;
  summary?: Record<string, unknown>;
}

export interface AgentCapabilityExecutionInput<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  organization: OrganizationName;
  actor: UserName | null;
  agentVersion: AgentVersionName;
  session: AgentSessionName;
  task: AgentSessionTaskName;
  execution: AgentExecutionName;
  attempt: AgentExecutionAttemptName;
  operation: OperationRunName;
  requestId: RequestId;
  input: TInput;
}

/**
 * Inline AG-UI is a persisted session execution, not an Operations worker.
 * Only a handler that explicitly exposes this narrow read surface may receive
 * it; the normal capability method remains strictly Operation-bound.
 */
export interface AgentInteractiveCapabilityExecutionInput<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<AgentCapabilityExecutionInput<TInput>, 'operation'> {
  operation: null;
}

export interface AgentCapabilityExecutionResult {
  outputSummary?: Record<string, unknown>;
  resourceType?: string | null;
  resourceId?: string | null;
  artifacts?: AgentCapabilityArtifactOutput[];
  interactionUiResult?: InteractionUiResult;
}

export interface AgentCapabilityHandler<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> {
  key: string;
  ownerDomain: string;
  executionKind: AgentCapabilityExecutionKind;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  sideEffects: AgentCapabilitySideEffect[];
  approvalRisk: AgentCapabilityApprovalRisk;
  idempotencyKey(input: AgentCapabilityExecutionInput<TInput>): string | null;
  execute(
    input: AgentCapabilityExecutionInput<TInput>,
  ): Promise<AgentCapabilityExecutionResult>;
  executeInteractive?(
    input: AgentInteractiveCapabilityExecutionInput<TInput>,
  ): Promise<AgentCapabilityExecutionResult>;
}
