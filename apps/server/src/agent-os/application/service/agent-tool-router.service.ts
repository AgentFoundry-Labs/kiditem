import { Inject, Injectable } from '@nestjs/common';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import type {
  AgentArtifactRecord,
  AgentToolInvocationRecord,
} from '../../domain/agent-os.types';
import type {
  AgentCapabilityExecutionInput,
  AgentCapabilityHandler,
} from '../port/out/capability/agent-capability-handler.port';
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
      if (existing) {
        const resolved = await this.resolveExistingIdempotentInvocation({
          input,
          handler,
          executionInput,
          invocation: existing,
        });
        if (resolved) return resolved;
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

    if (idempotencyKey && invocation.created === false) {
      const resolved = await this.resolveExistingIdempotentInvocation({
        input,
        handler,
        executionInput,
        invocation,
      });
      if (resolved) return resolved;
      return { status: invocation.status, invocation, artifacts: [] };
    }

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

    return this.executeCapabilityInvocation({
      input,
      handler,
      executionInput,
      invocation,
    });
  }

  private async resolveExistingIdempotentInvocation(input: {
    input: InvokeAgentToolInput;
    handler: AgentCapabilityHandler;
    executionInput: AgentCapabilityExecutionInput;
    invocation: AgentToolInvocationRecord;
  }) {
    if (isCleanSucceededInvocation(input.invocation)) {
      const artifacts = await this.materializeSucceededIdempotentArtifacts({
        input: input.input,
        invocation: input.invocation,
      });
      return {
        status: input.invocation.status,
        invocation: input.invocation,
        artifacts,
      };
    }

    if (
      input.invocation.status === 'requested' ||
      input.invocation.status === 'running'
    ) {
      return {
        status: input.invocation.status,
        invocation: input.invocation,
        artifacts: [],
      };
    }

    if (input.invocation.status === 'waiting_approval') {
      return this.resumeWaitingInvocation(input);
    }

    return null;
  }

  private async resumeWaitingInvocation(input: {
    input: InvokeAgentToolInput;
    handler: AgentCapabilityHandler;
    executionInput: AgentCapabilityExecutionInput;
    invocation: AgentToolInvocationRecord;
  }) {
    if (!input.invocation.approvalRequestId) {
      return { status: input.invocation.status, invocation: input.invocation, artifacts: [] };
    }

    const approval = await this.repository.findApprovalRequestById({
      organizationId: input.input.organizationId,
      approvalRequestId: input.invocation.approvalRequestId,
    });
    if (approval?.status !== 'approved') {
      return { status: input.invocation.status, invocation: input.invocation, artifacts: [] };
    }
    if (approval.requestId !== input.input.requestId) {
      throw new AgentOsRuntimeError(
        'approval_request_mismatch',
        'Approved capability invocation belongs to a different request.',
      );
    }

    const runningClaim = await this.repository.markToolInvocationRunning({
      organizationId: input.input.organizationId,
      invocationId: input.invocation.id,
    });
    if (!runningClaim.claimed) {
      if (isCleanSucceededInvocation(runningClaim.invocation)) {
        const artifacts = await this.materializeSucceededIdempotentArtifacts({
          input: input.input,
          invocation: runningClaim.invocation,
        });
        return {
          status: runningClaim.invocation.status,
          invocation: runningClaim.invocation,
          artifacts,
        };
      }
      return {
        status: runningClaim.invocation.status,
        invocation: runningClaim.invocation,
        artifacts: [],
      };
    }

    return this.executeCapabilityInvocation({
      ...input,
      invocation: runningClaim.invocation,
    });
  }

  private async materializeSucceededIdempotentArtifacts(input: {
    input: InvokeAgentToolInput;
    invocation: AgentToolInvocationRecord;
  }): Promise<AgentArtifactRecord[]> {
    const artifacts = await this.repository.listArtifacts({
      organizationId: input.input.organizationId,
      toolInvocationId: input.invocation.id,
    });
    if (!input.input.conversationId || artifacts.length === 0) {
      return artifacts;
    }

    const sameContext = artifacts.every(
      (artifact) =>
        artifact.conversationId === input.input.conversationId &&
        artifact.agentInstanceId === input.input.agentInstanceId &&
        artifact.requestId === (input.input.requestId ?? null) &&
        artifact.runId === (input.input.runId ?? null),
    );
    if (sameContext) return artifacts;

    const visibleArtifacts = await this.repository.listArtifacts({
      organizationId: input.input.organizationId,
      conversationId: input.input.conversationId,
    });

    const currentArtifacts: AgentArtifactRecord[] = [];
    for (const artifact of artifacts) {
      const visible = visibleArtifacts.find((candidate) =>
        sameArtifactIdentity(candidate, artifact),
      );
      if (visible) {
        currentArtifacts.push(visible);
        continue;
      }
      currentArtifacts.push(
        await this.repository.createArtifact({
          organizationId: input.input.organizationId,
          conversationId: input.input.conversationId,
          agentInstanceId: input.input.agentInstanceId,
          requestId: input.input.requestId ?? null,
          runId: input.input.runId ?? null,
          toolInvocationId: null,
          artifactType: artifact.artifactType,
          targetDomain: artifact.targetDomain,
          targetModel: artifact.targetModel,
          targetId: artifact.targetId,
          title: artifact.title,
          href: artifact.href,
          summary: {
            ...artifact.summary,
            agentOsCacheSource: {
              artifactId: artifact.id,
              toolInvocationId: input.invocation.id,
            },
          },
        }),
      );
    }
    return currentArtifacts;
  }

  private async executeCapabilityInvocation(input: {
    input: InvokeAgentToolInput;
    handler: AgentCapabilityHandler;
    executionInput: AgentCapabilityExecutionInput;
    invocation: AgentToolInvocationRecord;
  }) {
    try {
      const result = await input.handler.execute(input.executionInput);
      const parsedOutput = input.handler.outputSchema.safeParse(
        result.outputSummary ?? {},
      );
      if (!parsedOutput.success) {
        throw new AgentOsRuntimeError(
          'capability_output_invalid',
          parsedOutput.error.issues.map((issue) => issue.message).join('; '),
        );
      }

      const artifactInputs = (result.artifacts ?? []).map((artifact) => ({
        conversationId: input.input.conversationId ?? null,
        agentInstanceId: input.input.agentInstanceId,
        requestId: input.input.requestId ?? null,
        runId: input.input.runId ?? null,
        artifactType: artifact.artifactType,
        targetDomain: artifact.targetDomain,
        targetModel: artifact.targetModel,
        targetId: artifact.targetId ?? null,
        title: artifact.title,
        href: artifact.href ?? null,
        summary: artifact.summary ?? {},
      }));

      if (
        artifactInputs.length > 0 &&
        this.repository.completeToolInvocationWithArtifacts
      ) {
        const completed =
          await this.repository.completeToolInvocationWithArtifacts({
            organizationId: input.input.organizationId,
            invocationId: input.invocation.id,
            status: 'succeeded',
            outputSummary: parsedOutput.data,
            resourceType: result.resourceType ?? null,
            resourceId: result.resourceId ?? null,
            artifacts: artifactInputs,
          });
        return {
          status: completed.invocation.status,
          invocation: completed.invocation,
          artifacts: completed.artifacts,
        };
      }

      const completed = await this.repository.completeToolInvocation({
        organizationId: input.input.organizationId,
        invocationId: input.invocation.id,
        status: 'succeeded',
        outputSummary: parsedOutput.data,
        resourceType: result.resourceType ?? null,
        resourceId: result.resourceId ?? null,
      });

      const artifacts = [];
      for (const artifact of artifactInputs) {
        artifacts.push(
          await this.repository.createArtifact({
            organizationId: input.input.organizationId,
            toolInvocationId: completed.id,
            ...artifact,
          }),
        );
      }

      return { status: completed.status, invocation: completed, artifacts };
    } catch (error) {
      const message = errorMessage(error);
      await this.repository.completeToolInvocation({
        organizationId: input.input.organizationId,
        invocationId: input.invocation.id,
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

function sameArtifactIdentity(
  left: AgentArtifactRecord,
  right: AgentArtifactRecord,
): boolean {
  return (
    left.artifactType === right.artifactType &&
    left.targetDomain === right.targetDomain &&
    left.targetModel === right.targetModel &&
    left.targetId === right.targetId
  );
}

function isCleanSucceededInvocation(
  invocation: AgentToolInvocationRecord,
): boolean {
  return (
    invocation.status === 'succeeded' &&
    !invocation.errorCode &&
    !invocation.errorMessage
  );
}
