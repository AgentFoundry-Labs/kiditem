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
  AGENT_SESSION_CAPABILITY_INVOCATION_PORT,
  type AgentSessionCapabilityInvocationPort,
} from '../port/in/session-capability/agent-capability-invocation.port';
import {
  AGENT_EXECUTION_CONTEXT_REPOSITORY,
  type AgentExecutionContextRepositoryPort,
  type AgentRuntimeExecutionGraph,
} from '../port/out/repository/agent-execution-context.repository.port';
import type { AgentOsMcpExecutionContextPort } from '../port/in/capability/agent-os-mcp-tool-execution.port';
import {
  AGENT_SESSION_TRANSITION_TRANSACTION,
  type AgentSessionTransitionTransactionPort,
} from '../port/out/transaction/session-control/agent-session-transition.transaction.port';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import {
  commonMcpToolsForAgentType,
  firstClassMcpToolNameForCapability,
  KidItemMcpToolRegistry,
} from './kiditem-mcp-tool-registry.service';

export type AgentOsMcpExecutionContext = AgentOsMcpExecutionContextPort;

export interface ExecuteAgentOsMcpToolInput {
  context: AgentOsMcpExecutionContext;
  toolName: string;
  arguments: Record<string, unknown>;
}

const READ_CONTEXT_TOOL = 'agent_os_read_context';
const READ_TASK_GRAPH_TOOL = 'agent_os_read_task_graph';
const READ_ARTIFACTS_TOOL = 'agent_os_read_artifacts';
const FINALIZE_TASK_TOOL = 'agent_os_finalize_task';
const localExecutionContextSchema = z.object({
  organizationId: z.string().uuid(),
  sessionId: z.string().uuid(),
  executionId: z.string().uuid(),
  attemptId: z.string().uuid(),
  startIntentId: z.string().uuid(),
  runtimeCredentialGeneration: z.number().int().nonnegative(),
}).strict();
const activeTaskStatuses = new Set([
  'queued',
  'interpreting',
  'running',
  'waiting_approval',
  'paused',
]);

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
    @Inject(AGENT_EXECUTION_CONTEXT_REPOSITORY)
    private readonly contexts: AgentExecutionContextRepositoryPort,
    @Inject(AGENT_SESSION_CAPABILITY_INVOCATION_PORT)
    private readonly capabilities: AgentSessionCapabilityInvocationPort,
    private readonly registry: AgentCapabilityRegistry,
    private readonly tools: KidItemMcpToolRegistry,
    @Inject(AGENT_SESSION_TRANSITION_TRANSACTION)
    private readonly transitions: AgentSessionTransitionTransactionPort,
  ) {}

  async listAvailableTools(
    context: AgentOsMcpExecutionContext,
  ): Promise<Array<{ name: string }>> {
    const graph = await this.resolve(context);
    return this.availableTools(graph);
  }

  async execute(input: ExecuteAgentOsMcpToolInput): Promise<unknown> {
    const graph = await this.resolve(input.context);
    if (input.toolName === READ_CONTEXT_TOOL) {
      return this.readContext(graph);
    }
    if (input.toolName === READ_TASK_GRAPH_TOOL) {
      return { tasks: this.taskGraph(graph) };
    }
    if (input.toolName === READ_ARTIFACTS_TOOL) {
      return { artifacts: this.artifacts(graph) };
    }
    if (input.toolName === FINALIZE_TASK_TOOL) {
      return this.finalizationRequest(graph, input.arguments);
    }
    const capabilityKey = this.capabilityKeyForTool(graph, input.toolName);
    if (!capabilityKey) {
      throw new AgentOsRuntimeError(
        'MCP_TOOL_UNSUPPORTED',
        'The requested MCP tool is not available for this execution.',
      );
    }
    return this.capabilities.invoke({
      invocationSurface: 'mcp_runtime',
      session: this.names(graph).session,
      task: this.names(graph).task,
      execution: this.names(graph).execution,
      capabilityKey,
      input: strictArguments(input.arguments),
    });
  }

  private async resolve(
    context: AgentOsMcpExecutionContext,
  ): Promise<AgentRuntimeExecutionGraph> {
    const exact = localExecutionContextSchema.safeParse(context);
    if (!exact.success) throw denied();
    const graph = await this.contexts.loadRuntimeExecutionGraph(exact.data);
    if (
      !graph ||
      graph.organizationId !== exact.data.organizationId ||
      graph.sessionId !== exact.data.sessionId ||
      graph.executionId !== exact.data.executionId ||
      graph.attemptId !== exact.data.attemptId ||
      graph.startIntentId !== exact.data.startIntentId ||
      graph.runtimeCredentialGeneration !== exact.data.runtimeCredentialGeneration ||
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

  private directCapabilityTools(
    graph: AgentRuntimeExecutionGraph,
  ): Array<{ name: string }> {
    return policyCapabilityKeys(graph.policyCapabilityKeys)
      .filter((key) => this.isDirectlyInvocableRegisteredCapability(key))
      .map((key) => ({ key, name: firstClassMcpToolNameForCapability(key) }))
      .filter(({ key, name }) =>
        this.tools.resolveTool(name, { agentType: graph.agentDefinitionKey })
          ?.descriptor.capabilityKey === key,
      )
      .map(({ name }) => ({ name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private capabilityKeyForTool(
    graph: AgentRuntimeExecutionGraph,
    toolName: string,
  ): string | null {
    const resolved = this.tools.resolveTool(toolName, {
      agentType: graph.agentDefinitionKey,
    });
    if (!resolved) return null;
    const key = resolved.descriptor.capabilityKey;
    return policyCapabilityKeys(graph.policyCapabilityKeys).includes(key) &&
      this.isDirectlyInvocableRegisteredCapability(key)
      ? key
      : null;
  }

  private isDirectlyInvocableRegisteredCapability(key: string): boolean {
    const handler = this.registry.resolve(key);
    return Boolean(
      handler &&
      (handler.approvalRisk === 'none' || handler.approvalRisk === 'low'),
    );
  }

  private availableTools(graph: AgentRuntimeExecutionGraph): Array<{ name: string }> {
    const controls = commonMcpToolsForAgentType(graph.agentDefinitionKey)
      .filter((name) =>
        name === READ_CONTEXT_TOOL ||
        name === READ_TASK_GRAPH_TOOL ||
        name === READ_ARTIFACTS_TOOL ||
        name === FINALIZE_TASK_TOOL,
      )
      .map((name) => ({ name }));
    return [...controls, ...this.directCapabilityTools(graph)];
  }

  private taskGraph(graph: AgentRuntimeExecutionGraph) {
    const parsed = z.array(z.object({
      taskId: z.string().uuid(),
      parentTaskId: z.string().uuid().nullable(),
      objective: z.string().max(2_000).nullable(),
      status: z.string().min(1).max(64),
      agentDefinitionKey: z.string().min(1).max(128),
    }).strict()).max(100).safeParse(graph.taskGraph);
    if (!parsed.success) throw denied();
    return parsed.data;
  }

  private artifacts(graph: AgentRuntimeExecutionGraph) {
    const parsed = z.array(z.object({
      artifactId: z.string().uuid(),
      taskId: z.string().uuid(),
      executionId: z.string().uuid(),
      artifactType: z.string().min(1).max(128),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      metadata: z.unknown(),
    }).strict()).max(100).safeParse(graph.artifacts);
    if (!parsed.success) throw denied();
    return parsed.data;
  }

  private async finalizationRequest(
    graph: AgentRuntimeExecutionGraph,
    value: Record<string, unknown>,
  ) {
    if (graph.agentDefinitionKey === 'sourcing') {
      throw new AgentOsRuntimeError(
        'MCP_TOOL_UNSUPPORTED',
        'The requested MCP tool is not available for this execution.',
      );
    }
    const parsed = z.object({
      status: z.enum(['succeeded', 'failed']),
      summary: z.union([
        z.string().trim().min(1).max(6_000),
        z.record(z.string(), z.unknown()),
      ]),
      artifactIds: z.array(z.string().uuid()).max(100).default([]),
      error: z.record(z.string(), z.unknown()).nullable().optional(),
    }).strict().safeParse(value);
    if (!parsed.success) {
      throw new AgentOsRuntimeError(
        'MCP_FINALIZE_INPUT_INVALID',
        'Task finalization input is invalid.',
      );
    }
    const visible = new Set(this.artifacts(graph).map((artifact) => artifact.artifactId));
    if (parsed.data.artifactIds.some((id) => !visible.has(id))) {
      throw new AgentOsRuntimeError(
        'MCP_FINALIZE_ARTIFACT_NOT_VISIBLE',
        'Task finalization references an artifact outside this session.',
      );
    }
    const task = await this.transitions.transitionTask({
      organizationId: graph.organizationId,
      sessionId: graph.sessionId,
      taskId: graph.sessionTaskId,
      expectedState: graph.taskStatus,
      state: parsed.data.status === 'succeeded' ? 'completed' : 'failed',
    });
    return {
      task: {
        name: this.names(graph).task,
        status: task.status,
      },
      summary: parsed.data.summary,
      artifactIds: parsed.data.artifactIds,
      error: parsed.data.error ?? null,
    };
  }

  private readContext(graph: AgentRuntimeExecutionGraph) {
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

  private names(graph: AgentRuntimeExecutionGraph) {
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
    'The local MCP execution context cannot access this execution.',
  );
}
