import type { z } from 'zod';

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
  organizationId: string;
  conversationId?: string | null;
  agentInstanceId: string;
  agentType: string;
  requestId?: string | null;
  runId?: string | null;
  input: TInput;
}

export interface AgentCapabilityExecutionResult {
  outputSummary?: Record<string, unknown>;
  resourceType?: string | null;
  resourceId?: string | null;
  artifacts?: AgentCapabilityArtifactOutput[];
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
}
