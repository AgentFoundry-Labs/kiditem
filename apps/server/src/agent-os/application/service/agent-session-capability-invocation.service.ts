import { Inject, Injectable } from '@nestjs/common';
import {
  parseAgentExecutionName,
  parseAgentSessionName,
  parseAgentSessionTaskName,
} from '@kiditem/shared/identifiers';
import {
  AGENT_INTERACTION_REPOSITORY,
  type AgentInteractionRepositoryPort,
} from '../port/out/repository/agent-interaction-repository.port';
import {
  AGENT_SESSION_CONTROL_REPOSITORY,
  type AgentSessionControlRepositoryPort,
} from '../port/out/repository/agent-session-control.repository.port';
import type {
  AgentSessionCapabilityInvocationInput,
  AgentSessionCapabilityInvocationPort,
} from '../port/in/agent-capability-invocation.port';
import type { AgentCapabilityExecutionResult } from '../port/out/capability/agent-capability-handler.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';

@Injectable()
export class AgentSessionCapabilityInvocationService
  implements AgentSessionCapabilityInvocationPort
{
  constructor(
    @Inject(AGENT_INTERACTION_REPOSITORY)
    private readonly interactions: AgentInteractionRepositoryPort,
    @Inject(AGENT_SESSION_CONTROL_REPOSITORY)
    private readonly controls: AgentSessionControlRepositoryPort,
    private readonly capabilities: AgentCapabilityRegistry,
  ) {}

  async invoke(
    input: AgentSessionCapabilityInvocationInput,
  ): Promise<AgentCapabilityExecutionResult> {
    let session: ReturnType<typeof parseAgentSessionName>;
    let task: ReturnType<typeof parseAgentSessionTaskName>;
    let execution: ReturnType<typeof parseAgentExecutionName>;
    try {
      session = parseAgentSessionName(input.session);
      task = parseAgentSessionTaskName(input.task, input.session);
      execution = parseAgentExecutionName(input.execution, input.session);
    } catch {
      throw denied();
    }
    const context = await this.interactions.loadExecutionRuntimeContext({
      executionId: execution.execution,
    });
    if (
      !context ||
      context.organizationId !== session.organization ||
      context.sessionId !== session.session ||
      context.sessionTaskId !== task.task ||
      context.executionId !== execution.execution ||
      context.lifecycle !== 'active'
    ) {
      throw denied();
    }

    if (!context.capabilityKeys.includes(input.capabilityKey)) {
      throw denied();
    }
    const handler = this.capabilities.resolve(input.capabilityKey);
    if (!handler) throw denied();
    if (
      handler.approvalRisk !== 'none' ||
      handler.sideEffects.length !== 1 ||
      handler.sideEffects[0] !== 'read'
    ) {
      throw new AgentOsRuntimeError(
        'AGENT_CAPABILITY_APPROVAL_REQUIRED',
        'A non-read or approval-gated capability requires an explicit session approval.',
      );
    }

    const parsedInput = handler.inputSchema.safeParse(input.input);
    if (!parsedInput.success) {
      throw new AgentOsRuntimeError(
        'AGENT_EXECUTION_CAPABILITY_INPUT_INVALID',
        parsedInput.error.issues.map((issue) => issue.message).join('; '),
      );
    }

    // Recheck immediately before owner-domain dispatch. The runtime and browser
    // never supply these identities or this capability set.
    const allowed = await this.controls.isExecutionCapabilityAllowed({
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      sessionTaskId: context.sessionTaskId,
      executionId: context.executionId,
      capabilityKey: input.capabilityKey,
    });
    if (!allowed) throw denied();

    const executionInput = {
      organizationId: context.organizationId,
      // Legacy handler fields are deliberately null/derived only; they never
      // admit a generic AgentRun identity into this official invocation path.
      conversationId: null,
      agentInstanceId: context.agentVersionId,
      agentType: context.agentDefinitionKey,
      requestId: null,
      runId: null,
      requestedByUserId: context.userId,
      sessionId: context.sessionId,
      sessionTaskId: context.sessionTaskId,
      executionId: context.executionId,
      agentVersionId: context.agentVersionId,
      policySnapshotId: context.policySnapshotId,
      input: parsedInput.data,
    };
    const result = await handler.execute(executionInput);
    if (result.outputSummary) handler.outputSchema.parse(result.outputSummary);
    return result;
  }
}

function denied(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'AGENT_EXECUTION_CAPABILITY_DENIED',
    'Capability is outside the exact active Agent session execution policy.',
  );
}
