import { Injectable } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';

/**
 * Legacy AgentRun tool invocation shape retained only so legacy callers fail
 * deterministically while their transport is being retired.  It intentionally
 * cannot name an official AgentSession execution graph.
 */
export interface InvokeAgentToolInput {
  organizationId: string;
  conversationId?: string | null;
  agentInstanceId: string;
  agentType: string;
  requestId?: string | null;
  runId?: string | null;
  capabilityKey: string;
  input: Record<string, unknown>;
  requestedByUserId?: string | null;
  sessionId?: string;
  sessionTaskId?: string;
  executionId?: string;
}

export interface RetiredLegacyCapabilityInvocationResult {
  status: string;
  invocation: {
    id: string;
    approvalRequestId?: string | null;
    outputSummary?: Record<string, unknown> | null;
  };
  artifacts: Array<{
    id: string;
    artifactType: string;
    title: string;
    summary?: Record<string, unknown> | null;
    href?: string | null;
    targetDomain: string;
    targetModel: string;
  }>;
}

/**
 * Official capability handlers accept only AgentSessionCapabilityInvocation
 * input.  The legacy router must never fabricate those coordinates or call a
 * registered handler with an incomplete graph.
 */
@Injectable()
export class AgentToolRouter {
  async invoke(
    input: InvokeAgentToolInput,
  ): Promise<RetiredLegacyCapabilityInvocationResult> {
    throw new AgentOsRuntimeError(
      'legacy_capability_invocation_retired',
      `Legacy AgentRun capability invocation is retired: ${input.capabilityKey}`,
    );
  }
}
