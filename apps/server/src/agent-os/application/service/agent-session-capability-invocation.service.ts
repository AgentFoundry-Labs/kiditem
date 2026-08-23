import { Inject, Injectable } from "@nestjs/common";
import { createHash } from 'node:crypto';
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
import type {
  AgentCapabilityExecutionInput,
  AgentCapabilityExecutionResult,
  AgentInteractiveCapabilityExecutionInput,
} from "../port/out/capability/agent-capability-handler.port";
import { AgentOsRuntimeError } from "../../domain/agent-os.errors";
import { AgentCapabilityRegistry } from "./agent-capability-registry.service";
import {
  AGENT_CONVERSATION_EVENT_TRANSACTION,
  type AgentConversationEventTransactionPort,
} from '../port/out/transaction/interaction/agent-conversation-event.transaction.port';

@Injectable()
export class AgentSessionCapabilityInvocationService implements AgentSessionCapabilityInvocationPort {
  constructor(
    @Inject(AGENT_EXECUTION_QUERY_REPOSITORY)
    private readonly interactions: AgentExecutionQueryRepositoryPort,
    @Inject(AGENT_SESSION_CONTROL_QUERY_REPOSITORY)
    private readonly controls: AgentSessionControlQueryRepositoryPort,
    private readonly capabilities: AgentCapabilityRegistry,
    @Inject(AGENT_CONVERSATION_EVENT_TRANSACTION)
    private readonly events: AgentConversationEventTransactionPort,
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
    const interactive = input.invocationSurface === "interactive_runtime";
    const context = interactive
      ? await this.interactions.loadInlineAguiExecutionRuntimeContext({
          executionId: execution.execution,
        })
      : await this.interactions.loadExecutionRuntimeContext({
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
    const supportedRuntimeSurface =
      input.invocationSurface === "interactive_runtime" ||
      input.invocationSurface === "mcp_runtime";
    const directlyAllowed =
      supportedRuntimeSurface &&
      (handler.approvalRisk === "none" || handler.approvalRisk === "low");
    if (
      !directlyAllowed
    ) {
      throw new AgentOsRuntimeError(
        "AGENT_CAPABILITY_APPROVAL_REQUIRED",
        "The capability is not directly allowed on this official runtime surface.",
      );
    }
    // An inline AG-UI run deliberately has no Operations lease.  Keep that
    // exception limited to pure reads so a worker-owned action can never be
    // dispatched with an invented operation identity.
    if (interactive && handler.sideEffects.some((effect) => effect !== "read")) {
      throw denied();
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

    let executionInput:
      | AgentCapabilityExecutionInput
      | AgentInteractiveCapabilityExecutionInput;
    try {
      const organizationId = OrganizationIdSchema.parse(context.organizationId);
      const organization = formatOrganizationName(organizationId);
      const common = {
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
        requestId: RequestIdSchema.parse(context.startIntentId),
        input: parsedInput.data,
      };
      executionInput = interactive
        ? { ...common, operation: null }
        : {
            ...common,
            operation: formatOperationRunName(
              organizationId,
              OperationRunIdSchema.parse(
                (
                  context as Awaited<ReturnType<AgentExecutionQueryRepositoryPort["loadExecutionRuntimeContext"]>>
                )?.operationRunId,
              ),
            ),
          };
    } catch {
      throw denied();
    }
    const result = interactive
      ? await handler.executeInteractive?.(
          executionInput as AgentInteractiveCapabilityExecutionInput,
        )
      : await handler.execute(executionInput as AgentCapabilityExecutionInput);
    if (!result) throw denied();
    if (result.outputSummary) handler.outputSchema.parse(result.outputSummary);
    await this.events.appendExecutionEvent({
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      executionId: context.executionId,
      externalEventId: capabilityEvidenceEventId(
        context.attemptId,
        input.capabilityKey,
        parsedInput.data,
      ),
      eventType: 'state_snapshot',
      schemaVersion: 1,
      payload: {
        snapshotType: 'agent_capability_evidence',
        snapshotVersion: 1,
        data: {
          content: capabilityEvidenceContent({
            capabilityKey: input.capabilityKey,
            input: parsedInput.data,
            outputSummary: result.outputSummary ?? null,
            resourceType: result.resourceType ?? null,
            resourceId: result.resourceId ?? null,
          }),
        },
      },
    });
    return result;
  }
}

function denied(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    "AGENT_EXECUTION_CAPABILITY_DENIED",
    "Capability is outside the exact active Agent session execution policy.",
  );
}

function capabilityEvidenceEventId(
  attemptId: string,
  capabilityKey: string,
  input: unknown,
): string {
  return `${attemptId}:capability:${createHash('sha256')
    .update(canonicalJson({ capabilityKey, input }))
    .digest('hex')}`;
}

function capabilityEvidenceContent(value: Record<string, unknown>): string {
  const content = canonicalJson({ schemaVersion: 1, ...value });
  if (content.length > 12_000) {
    throw new AgentOsRuntimeError(
      'AGENT_CAPABILITY_EVIDENCE_TOO_LARGE',
      'Capability evidence exceeds the bounded official event payload.',
    );
  }
  return content;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw denied();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw denied();
}
