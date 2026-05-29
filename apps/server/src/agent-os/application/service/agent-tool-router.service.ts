import { Inject, Injectable } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import { AgentPolicyService } from './agent-policy.service';

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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class AgentToolRouter {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    private readonly policy: AgentPolicyService,
  ) {}

  async invoke(input: InvokeAgentToolInput) {
    const handler = this.registry.resolve(input.capabilityKey);
    if (!handler) {
      throw new AgentOsRuntimeError(
        'capability_not_registered',
        `Capability is not registered: ${input.capabilityKey}`,
      );
    }

    const parsedInput = handler.inputSchema.safeParse(input.input);
    if (!parsedInput.success) {
      throw new AgentOsRuntimeError(
        'capability_input_invalid',
        parsedInput.error.issues.map((issue) => issue.message).join('; '),
      );
    }

    const executionInput = { ...input, input: parsedInput.data };
    const idempotencyKey = handler.idempotencyKey(executionInput);
    if (idempotencyKey) {
      const existing = await this.repository.findToolInvocationByIdempotency({
        organizationId: input.organizationId,
        capabilityKey: input.capabilityKey,
        idempotencyKey,
      });
      if (existing?.status === 'succeeded') {
        const artifacts = await this.repository.listArtifacts({
          organizationId: input.organizationId,
          toolInvocationId: existing.id,
        });
        return { status: existing.status, invocation: existing, artifacts };
      }
    }

    const decision = await this.policy.authorizeToolUse({
      organizationId: input.organizationId,
      agentInstanceId: input.agentInstanceId,
      agentType: input.agentType,
      requestId: input.requestId ?? null,
      runId: input.runId ?? null,
      toolKey: input.capabilityKey,
      resourceType: handler.ownerDomain,
      resourceId: null,
      requestedByUserId: input.requestedByUserId ?? null,
      context: {
        executionKind: handler.executionKind,
        sideEffects: handler.sideEffects,
        approvalRisk: handler.approvalRisk,
      },
    });

    const invocation = await this.repository.createToolInvocation({
      organizationId: input.organizationId,
      conversationId: input.conversationId ?? null,
      agentInstanceId: input.agentInstanceId,
      requestId: input.requestId ?? null,
      runId: input.runId ?? null,
      capabilityKey: input.capabilityKey,
      policyDecision: decision.decision,
      reasonCode: decision.reasonCode,
      idempotencyKey,
      inputSummary: parsedInput.data,
    });

    if (decision.decision !== 'allowed') {
      return this.pauseOrDeny({
        input,
        invocationId: invocation.id,
        decision,
        capabilityKey: input.capabilityKey,
        handlerSnapshot: {
          sideEffects: handler.sideEffects,
          approvalRisk: handler.approvalRisk,
          idempotencyKey,
        },
        parsedInput: parsedInput.data,
      });
    }

    try {
      const result = await handler.execute(executionInput);
      const parsedOutput = handler.outputSchema.safeParse(
        result.outputSummary ?? {},
      );
      if (!parsedOutput.success) {
        throw new AgentOsRuntimeError(
          'capability_output_invalid',
          parsedOutput.error.issues.map((issue) => issue.message).join('; '),
        );
      }

      const completed = await this.repository.completeToolInvocation({
        organizationId: input.organizationId,
        invocationId: invocation.id,
        status: 'succeeded',
        outputSummary: parsedOutput.data,
        resourceType: result.resourceType ?? null,
        resourceId: result.resourceId ?? null,
      });

      const artifacts = [];
      for (const artifact of result.artifacts ?? []) {
        artifacts.push(
          await this.repository.createArtifact({
            organizationId: input.organizationId,
            conversationId: input.conversationId ?? null,
            agentInstanceId: input.agentInstanceId,
            requestId: input.requestId ?? null,
            runId: input.runId ?? null,
            toolInvocationId: completed.id,
            artifactType: artifact.artifactType,
            targetDomain: artifact.targetDomain,
            targetModel: artifact.targetModel,
            targetId: artifact.targetId ?? null,
            title: artifact.title,
            href: artifact.href ?? null,
            summary: artifact.summary ?? {},
          }),
        );
      }

      return { status: completed.status, invocation: completed, artifacts };
    } catch (error) {
      const message = errorMessage(error);
      await this.repository.completeToolInvocation({
        organizationId: input.organizationId,
        invocationId: invocation.id,
        status: 'failed',
        outputSummary: null,
        errorCode: 'capability_failed',
        errorMessage: message,
      });
      throw new AgentOsRuntimeError('capability_failed', message);
    }
  }

  private async pauseOrDeny(input: {
    input: InvokeAgentToolInput;
    invocationId: string;
    decision: Awaited<ReturnType<AgentPolicyService['authorizeToolUse']>>;
    capabilityKey: string;
    handlerSnapshot: Record<string, unknown>;
    parsedInput: Record<string, unknown>;
  }) {
    let approvalRequestId: string | null = null;
    const status =
      input.decision.decision === 'approval_required'
        ? 'waiting_approval'
        : 'failed';

    if (input.decision.decision === 'approval_required') {
      if (!input.input.requestId) {
        throw new AgentOsRuntimeError(
          'approval_request_requires_task',
          'Approval-required capability invocations require requestId.',
        );
      }
      const approval = await this.repository.createApprovalRequest({
        organizationId: input.input.organizationId,
        agentInstanceId: input.input.agentInstanceId,
        requestId: input.input.requestId,
        runId: input.input.runId ?? null,
        prompt: `Approve capability ${input.capabilityKey}`,
        reasonCode: input.decision.reasonCode,
        reason: input.decision.reason,
        payload: input.parsedInput,
        actionSnapshot: {
          capabilityKey: input.capabilityKey,
          ...input.handlerSnapshot,
        },
        requestedByUserId: input.input.requestedByUserId ?? null,
      });
      approvalRequestId = approval.id;

      await this.repository.markRequestStatus({
        organizationId: input.input.organizationId,
        requestId: input.input.requestId,
        status: 'requires_approval',
        errorCode: input.decision.reasonCode,
        errorMessage: input.decision.reason,
      });
    }

    const completed = await this.repository.completeToolInvocation({
      organizationId: input.input.organizationId,
      invocationId: input.invocationId,
      approvalRequestId,
      status,
      outputSummary: null,
      errorCode: input.decision.reasonCode,
      errorMessage: input.decision.reason,
    });

    return { status: completed.status, invocation: completed, artifacts: [] };
  }
}
