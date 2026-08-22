import { Inject, Injectable } from "@nestjs/common";
import {
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentDefinitionKeySchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  formatAgentExecutionName,
  parseAgentExecutionName,
  formatAgentSessionName,
  parseAgentSessionName,
  formatAgentSessionTaskName,
  parseAgentSessionTaskName,
  RequestIdSchema,
  formatAgentExecutionAttemptName,
  formatAgentVersionName,
  formatOperationRunName,
  formatOrganizationName,
  formatUserName,
  OperationRunIdSchema,
  OrganizationIdSchema,
  UserIdSchema,
} from "@kiditem/shared/identifiers";
import {
  AGENT_EXECUTION_QUERY_REPOSITORY,
  type AgentExecutionQueryRepositoryPort,
} from "../port/out/repository/interaction/agent-execution-query.repository.port";
import {
  AGENT_SESSION_CONTROL_QUERY_REPOSITORY,
  type AgentSessionControlQueryRepositoryPort,
} from "../port/out/repository/session-control/agent-session-control-query.repository.port";
import type {
  AgentSessionCapabilityInvocationInput,
  AgentSessionCapabilityInvocationPort,
} from "../port/in/session-capability/agent-capability-invocation.port";
import type { AgentCapabilityExecutionResult } from "../port/out/capability/agent-capability-handler.port";
import { AgentOsRuntimeError } from "../../domain/agent-os.errors";
import { AgentCapabilityRegistry } from "./agent-capability-registry.service";

@Injectable()
export class AgentSessionCapabilityInvocationService implements AgentSessionCapabilityInvocationPort {
  constructor(
    @Inject(AGENT_EXECUTION_QUERY_REPOSITORY)
    private readonly interactions: AgentExecutionQueryRepositoryPort,
    @Inject(AGENT_SESSION_CONTROL_QUERY_REPOSITORY)
    private readonly controls: AgentSessionControlQueryRepositoryPort,
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
      context.lifecycle !== "active"
    ) {
      throw denied();
    }

    if (!context.capabilityKeys.includes(input.capabilityKey)) {
      throw denied();
    }
    const handler = this.capabilities.resolve(input.capabilityKey);
    if (!handler) throw denied();
    if (
      handler.approvalRisk !== "none" ||
      handler.sideEffects.length !== 1 ||
      handler.sideEffects[0] !== "read"
    ) {
      throw new AgentOsRuntimeError(
        "AGENT_CAPABILITY_APPROVAL_REQUIRED",
        "A non-read or approval-gated capability requires an explicit session approval.",
      );
    }

    const parsedInput = handler.inputSchema.safeParse(input.input);
    if (!parsedInput.success) {
      throw new AgentOsRuntimeError(
        "AGENT_EXECUTION_CAPABILITY_INPUT_INVALID",
        parsedInput.error.issues.map((issue) => issue.message).join("; "),
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

    let executionInput;
    try {
      const organizationId = OrganizationIdSchema.parse(context.organizationId);
      const organization = formatOrganizationName(organizationId);
      executionInput = {
        organization,
        actor: context.userId ? formatUserName(UserIdSchema.parse(context.userId)) : null,
        agentVersion: formatAgentVersionName(
          AgentDefinitionKeySchema.parse(context.agentDefinitionKey),
          AgentVersionKeySchema.parse(String(context.agentVersion)),
        ),
        session: formatAgentSessionName(organizationId, AgentSessionIdSchema.parse(context.sessionId)),
        task: formatAgentSessionTaskName(
          organizationId,
          AgentSessionIdSchema.parse(context.sessionId),
          AgentSessionTaskIdSchema.parse(context.sessionTaskId),
        ),
        execution: formatAgentExecutionName(
          organizationId,
          AgentSessionIdSchema.parse(context.sessionId),
          AgentExecutionIdSchema.parse(context.executionId),
        ),
        attempt: formatAgentExecutionAttemptName(
          organizationId,
          AgentSessionIdSchema.parse(context.sessionId),
          AgentExecutionIdSchema.parse(context.executionId),
          AgentExecutionAttemptIdSchema.parse(context.attemptId),
        ),
        operation: formatOperationRunName(organizationId, OperationRunIdSchema.parse(context.operationRunId)),
        requestId: RequestIdSchema.parse(context.startIntentId),
        input: parsedInput.data,
      };
    } catch {
      throw denied();
    }
    const result = await handler.execute(executionInput);
    if (result.outputSummary) handler.outputSchema.parse(result.outputSummary);
    return result;
  }
}

function denied(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    "AGENT_EXECUTION_CAPABILITY_DENIED",
    "Capability is outside the exact active Agent session execution policy.",
  );
}
