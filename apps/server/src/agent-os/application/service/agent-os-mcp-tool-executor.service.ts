import { Inject, Injectable } from '@nestjs/common';
import { CanonicalResourceRefSchema } from '@kiditem/shared/agent-interaction';
import {
  AgentDefinitionKeySchema,
  AgentExecutionAttemptIdSchema,
  AgentExecutionIdSchema,
  AgentSessionIdSchema,
  AgentSessionTaskIdSchema,
  AgentVersionKeySchema,
  formatAgentExecutionAttemptName,
  formatAgentExecutionName,
  formatAgentSessionName,
  formatAgentSessionTaskName,
  formatAgentVersionName,
  formatOperationRunName,
  formatOrganizationName,
  formatUserName,
  OperationRunIdSchema,
  OrganizationIdSchema,
  RequestIdSchema,
  UserIdSchema,
} from '@kiditem/shared/identifiers';
import { z } from 'zod';
import {
  AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT,
  type AgentRuntimeCredentialVerificationPort,
} from '../port/in/session-execution/agent-runtime-credential-verification.port';
import {
  AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
  type AgentSessionCapabilityInvocationPort,
} from '../port/in/session-capability/agent-capability-invocation.port';
import {
  AGENT_EXECUTION_CONTEXT_REPOSITORY,
  type AgentExecutionContextRepositoryPort,
  type AgentRuntimeCredentialExecutionGraph,
} from '../port/out/repository/agent-execution-context.repository.port';
import type { AgentOsMcpExecutionContextPort } from '../port/in/capability/agent-os-mcp-tool-execution.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';

export type AgentOsMcpExecutionContext = AgentOsMcpExecutionContextPort;

export interface ExecuteAgentOsMcpToolInput {
  context: AgentOsMcpExecutionContext;
  toolName: string;
  arguments: Record<string, unknown>;
}

const READ_CONTEXT_TOOL = 'agent_os_read_context';
const activeTaskStatuses = new Set([
  'queued',
  'interpreting',
  'running',
  'waiting_approval',
  'paused',
]);

function capabilityToolName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}

function policyCapabilityKeys(value: unknown): string[] {
  const result = z.array(z.string().min(1).max(128)).safeParse(value);
  if (!result.success || new Set(result.data).size !== result.data.length) {
    throw denied();
  }
  return result.data;
}

@Injectable()
export class AgentOsMcpToolExecutor {
  constructor(
    @Inject(AGENT_RUNTIME_CREDENTIAL_VERIFICATION_PORT)
    private readonly credentials: AgentRuntimeCredentialVerificationPort,
    @Inject(AGENT_EXECUTION_CONTEXT_REPOSITORY)
    private readonly contexts: AgentExecutionContextRepositoryPort,
    @Inject(AGENT_SESSION_CAPABILITY_INVOCATION_PORT)
    private readonly capabilities: AgentSessionCapabilityInvocationPort,
    private readonly registry: AgentCapabilityRegistry,
  ) {}

  async listAvailableTools(
    context: AgentOsMcpExecutionContext,
  ): Promise<Array<{ name: string }>> {
    const graph = await this.resolve(context);
    return [
      { name: READ_CONTEXT_TOOL },
      ...this.readOnlyCapabilityTools(graph),
    ];
  }

  async execute(input: ExecuteAgentOsMcpToolInput): Promise<unknown> {
    const graph = await this.resolve(input.context);
    if (input.toolName === READ_CONTEXT_TOOL) {
      return this.readContext(graph);
    }
    const capabilityKey = this.capabilityKeyForTool(graph, input.toolName);
    if (!capabilityKey) {
      throw new AgentOsRuntimeError(
        'MCP_TOOL_UNSUPPORTED',
        'The requested MCP tool is not available for this execution.',
      );
    }
    return this.capabilities.invoke({
      session: this.names(graph).session,
      task: this.names(graph).task,
      execution: this.names(graph).execution,
      capabilityKey,
      input: strictArguments(input.arguments),
    });
  }

  private async resolve(
    context: AgentOsMcpExecutionContext,
  ): Promise<AgentRuntimeCredentialExecutionGraph> {
    if (!context || typeof context.credential !== 'string' || !context.credential.trim()) {
      throw denied();
    }
    let claims: Awaited<ReturnType<AgentRuntimeCredentialVerificationPort['verify']>>;
    try {
      claims = await this.credentials.verify({ token: context.credential });
    } catch {
      throw denied();
    }
    const graph = await this.contexts.loadRuntimeCredentialExecutionGraph(claims);
    if (
      !graph ||
      graph.organizationId !== claims.organizationId ||
      graph.sessionId !== claims.sessionId ||
      graph.executionId !== claims.executionId ||
      graph.attemptId !== claims.attemptId ||
      graph.startIntentId !== claims.startIntentId ||
      graph.runtimeCredentialGeneration !== claims.runtimeCredentialGeneration ||
      graph.sessionLifecycle !== 'active' ||
      graph.executionStatus !== 'running' ||
      graph.attemptState !== 'running' ||
      graph.operationStatus !== 'running' ||
      !activeTaskStatuses.has(graph.taskStatus)
    ) {
      throw denied();
    }
    return graph;
  }

  private readOnlyCapabilityTools(
    graph: AgentRuntimeCredentialExecutionGraph,
  ): Array<{ name: string }> {
    return policyCapabilityKeys(graph.policyCapabilityKeys)
      .filter((key) => this.isReadOnlyRegisteredCapability(key))
      .map((key) => ({ name: capabilityToolName(key) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private capabilityKeyForTool(
    graph: AgentRuntimeCredentialExecutionGraph,
    toolName: string,
  ): string | null {
    const matches = policyCapabilityKeys(graph.policyCapabilityKeys).filter(
      (key) => capabilityToolName(key) === toolName && this.isReadOnlyRegisteredCapability(key),
    );
    return matches.length === 1 ? matches[0] : null;
  }

  private isReadOnlyRegisteredCapability(key: string): boolean {
    const handler = this.registry.resolve(key);
    return Boolean(
      handler &&
      handler.approvalRisk === 'none' &&
      handler.sideEffects.length === 1 &&
      handler.sideEffects[0] === 'read',
    );
  }

  private readContext(graph: AgentRuntimeCredentialExecutionGraph) {
    const names = this.names(graph);
    const resourceRefs = z.array(CanonicalResourceRefSchema).max(50).safeParse(
      graph.currentResourceRefs,
    );
    if (!resourceRefs.success) throw denied();
    return {
      organization: names.organization,
      actor: names.actor,
      agentVersion: names.agentVersion,
      session: names.session,
      task: names.task,
      execution: names.execution,
      attempt: names.attempt,
      operation: names.operation,
      requestId: names.requestId,
      resourceRefs: resourceRefs.data,
    };
  }

  private names(graph: AgentRuntimeCredentialExecutionGraph) {
    try {
      const organizationId = OrganizationIdSchema.parse(graph.organizationId);
      const sessionId = AgentSessionIdSchema.parse(graph.sessionId);
      const executionId = AgentExecutionIdSchema.parse(graph.executionId);
      const organization = formatOrganizationName(organizationId);
      return {
        organization,
        actor: formatUserName(UserIdSchema.parse(graph.userId)),
        agentVersion: formatAgentVersionName(
          AgentDefinitionKeySchema.parse(graph.agentDefinitionKey),
          AgentVersionKeySchema.parse(String(graph.agentVersion)),
        ),
        session: formatAgentSessionName(organizationId, sessionId),
        task: formatAgentSessionTaskName(
          organizationId,
          sessionId,
          AgentSessionTaskIdSchema.parse(graph.sessionTaskId),
        ),
        execution: formatAgentExecutionName(organizationId, sessionId, executionId),
        attempt: formatAgentExecutionAttemptName(
          organizationId,
          sessionId,
          executionId,
          AgentExecutionAttemptIdSchema.parse(graph.attemptId),
        ),
        operation: formatOperationRunName(
          organizationId,
          OperationRunIdSchema.parse(graph.operationRunId),
        ),
        requestId: RequestIdSchema.parse(graph.startIntentId),
      };
    } catch {
      throw denied();
    }
  }
}

function strictArguments(value: unknown): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) throw denied();
  return parsed.data;
}

function denied(): AgentOsRuntimeError {
  return new AgentOsRuntimeError(
    'MCP_EXECUTION_DENIED',
    'The MCP runtime credential cannot access this execution.',
  );
}
