import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  findAgentDefinitionByType,
  listAgentDefinitions,
} from '../../domain/agent-definition.registry';
import { AgentOsRuntimeError } from '../../domain/agent-os.errors';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../port/out/repository/agent-os-repository.port';
import {
  AGENT_RUNNER_PORT,
  type AgentRunnerPort,
} from '../port/in/agent-runner.port';
import { AgentRunGraphService } from './agent-run-graph.service';
import { findAgentPlaybook } from './agent-playbook.registry';
import { AgentTaskDelegationService } from './agent-task-delegation.service';
import { AgentToolRouter } from './agent-tool-router.service';
import { KidItemMcpToolRegistry } from './kiditem-mcp-tool-registry.service';
import { OperatorContextBuilder } from './operator-context-builder.service';

export type KidItemMcpToolName =
  | 'kiditem_context_read'
  | 'kiditem_capabilities_list'
  | 'kiditem_capability_invoke'
  | 'agent_os_read_context'
  | 'agent_os_read_task_graph'
  | 'agent_os_read_artifacts'
  | 'agent_os_finalize_task'
  | 'agent_os_list_agents'
  | 'agent_os_create_task'
  | 'agent_os_request_user_input';

export interface AgentOsMcpExecutionContext {
  organizationId: string;
  conversationId: string;
  requestId: string;
  runId: string;
  agentInstanceId: string;
  agentType: string;
  requestedByUserId?: string | null;
}

export interface ExecuteAgentOsMcpToolInput {
  context: AgentOsMcpExecutionContext;
  toolName: KidItemMcpToolName | string;
  arguments: Record<string, unknown>;
}

const LISTING_GENERATION_PACKAGE_CAPABILITY =
  'product_listing.create_generation_package';
const LISTING_SOURCE_ARTIFACT_TYPES = new Set([
  'sourcing_scrape_snapshot',
  'sourcing_candidate',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function optionalStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0,
      )
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function toPublicStatus(status: string): string {
  return status === 'requested' ? 'queued' : status;
}

function toInlineChildTaskStatus(execution: {
  executed?: boolean;
  reason?: string;
  errorCode?: string;
} | null): 'failed' | 'waiting_approval' | 'succeeded' | 'queued' {
  if (!execution) return 'queued';
  if (execution.errorCode) return 'failed';
  if (execution.reason === 'requires_approval') return 'waiting_approval';
  return execution.executed ? 'succeeded' : 'queued';
}

function recordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function stringArrayField(
  value: Record<string, unknown>,
  keys: string[],
): string[] {
  for (const key of keys) {
    const array = uniqueStrings(optionalStringArray(value[key]));
    if (array.length > 0) return array;
  }
  return [];
}

function firstStringField(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const field = stringField(value[key]);
    if (field) return field;
  }
  return null;
}

function collectArtifactIds(input: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...optionalStringArray(input.sourceArtifactIds),
    ...optionalStringArray(input.artifactIds),
    stringField(input.sourceArtifactId) ?? '',
    stringField(input.artifactId) ?? '',
  ]);
}

function skuOptionNames(scrapedData: Record<string, unknown>): string[] {
  const fromSkuList = Array.isArray(scrapedData.sku_list)
    ? scrapedData.sku_list
        .map((entry) =>
          isRecord(entry)
            ? firstStringField(entry, ['specAttrs', 'option', 'name'])
            : null,
        )
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const fromVariants = Array.isArray(scrapedData.variants)
    ? scrapedData.variants
        .map((entry) =>
          isRecord(entry)
            ? firstStringField(entry, ['option', 'specAttrs', 'name'])
            : null,
        )
        .filter((entry): entry is string => Boolean(entry))
    : [];
  return uniqueStrings([...fromSkuList, ...fromVariants]);
}

function summarizeSpecs(scrapedData: Record<string, unknown>): string | null {
  if (!Array.isArray(scrapedData.specs)) return null;
  const lines = scrapedData.specs
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const key = stringField(entry.key);
      const value = stringField(entry.value);
      return key && value ? `${key}: ${value}` : null;
    })
    .filter((line): line is string => Boolean(line))
    .slice(0, 12);
  return lines.length > 0 ? lines.join('\n') : null;
}

function listingInputFromArtifactSummary(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  const scrapedData =
    recordField(summary, 'scraped_data') ??
    recordField(summary, 'scrapedData') ??
    recordField(summary, 'scrapeResult') ??
    summary;
  const media = recordField(scrapedData, 'media');
  const imageUrls = uniqueStrings([
    ...stringArrayField(scrapedData, ['imageUrls', 'images']),
    ...(media ? stringArrayField(media, ['images', 'imageUrls']) : []),
  ]);
  const optionNames = skuOptionNames(scrapedData);
  const productName =
    firstStringField(summary, ['productName', 'title']) ??
    firstStringField(scrapedData, ['productName', 'title']);
  const category =
    firstStringField(summary, ['category', 'categoryName']) ??
    firstStringField(scrapedData, ['category', 'categoryName', 'category_name']);
  const description =
    firstStringField(summary, ['description']) ??
    firstStringField(scrapedData, ['description']) ??
    summarizeSpecs(scrapedData);

  return {
    ...(productName ? { productName } : {}),
    ...(category ? { category } : {}),
    ...(description ? { description } : {}),
    ...(imageUrls.length > 0
      ? {
          imageUrls,
          thumbnailUrl: imageUrls[0],
          thumbnailUrls: imageUrls,
        }
      : {}),
    ...(optionNames.length > 0 ? { optionNames } : {}),
  };
}

function artifactSourceUrl(summary: Record<string, unknown>): string | null {
  const scrapedData =
    recordField(summary, 'scraped_data') ??
    recordField(summary, 'scrapedData') ??
    recordField(summary, 'scrapeResult');
  return (
    firstStringField(summary, ['sourceUrl', 'source_url', 'url']) ??
    (scrapedData
      ? firstStringField(scrapedData, ['sourceUrl', 'source_url', 'url'])
      : null)
  );
}

function parseCapabilityInvokeArguments(
  args: Record<string, unknown>,
): {
  capabilityKey: string;
  input: Record<string, unknown>;
} {
  if (typeof args.capabilityKey !== 'string' || args.capabilityKey.length === 0) {
    throw new AgentOsRuntimeError(
      'mcp_capability_input_invalid',
      'MCP capability invocation requires string capabilityKey.',
    );
  }

  const rawInput = args.input ?? {};
  if (!isRecord(rawInput)) {
    throw new AgentOsRuntimeError(
      'mcp_capability_input_invalid',
      'MCP capability invocation input must be an object.',
    );
  }

  return {
    capabilityKey: args.capabilityKey,
    input: rawInput,
  };
}

@Injectable()
export class AgentOsMcpToolExecutor {
  constructor(
    private readonly contextBuilder: OperatorContextBuilder,
    private readonly toolRegistry: KidItemMcpToolRegistry,
    private readonly toolRouter: AgentToolRouter,
    @Optional()
    private readonly graphService?: AgentRunGraphService,
    @Optional()
    private readonly delegation?: AgentTaskDelegationService,
    @Optional()
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository?: AgentOsRepositoryPort,
    @Optional()
    @Inject(AGENT_RUNNER_PORT)
    private readonly runner?: AgentRunnerPort,
  ) {}

  listAvailableTools(context: AgentOsMcpExecutionContext) {
    return this.toolRegistry.listToolsForContext(context);
  }

  async execute(input: ExecuteAgentOsMcpToolInput) {
    switch (input.toolName) {
      case 'agent_os_read_context':
      case 'kiditem_context_read':
        return this.contextBuilder.build({
          organizationId: input.context.organizationId,
          conversationId: input.context.conversationId,
          requestId: input.context.requestId,
        });
      case 'agent_os_read_task_graph':
        return this.readTaskGraph(input);
      case 'agent_os_read_artifacts':
        return this.readArtifacts(input);
      case 'agent_os_finalize_task':
        return this.finalizeTask(input);
      case 'agent_os_list_agents':
        this.assertOperator(input.context, input.toolName);
        return this.listAgents();
      case 'agent_os_create_task':
        this.assertOperator(input.context, input.toolName);
        return this.createTask(input);
      case 'agent_os_request_user_input':
        this.assertOperator(input.context, input.toolName);
        return this.requestUserInput(input);
      case 'kiditem_capabilities_list':
        return { items: this.toolRegistry.listToolsForContext(input.context) };
      case 'kiditem_capability_invoke':
        return this.invokeCapability(input);
      default:
        return this.invokeFirstClassDomainTool(input);
    }
  }

  private assertOperator(
    context: AgentOsMcpExecutionContext,
    toolName: string,
  ): void {
    const definition = findAgentDefinitionByType(context.agentType);
    if (definition?.delegationRole === 'orchestrator') return;
    throw new AgentOsRuntimeError(
      'mcp_operator_tool_denied',
      `MCP tool ${toolName} is available only to Operator agents.`,
    );
  }

  private async readTaskGraph(input: ExecuteAgentOsMcpToolInput) {
    if (!this.graphService) {
      throw new AgentOsRuntimeError(
        'mcp_graph_service_unavailable',
        'Agent OS task graph service is unavailable.',
      );
    }
    return this.graphService.getConversationGraph({
      organizationId: input.context.organizationId,
      conversationId: input.context.conversationId,
    });
  }

  private async readArtifacts(input: ExecuteAgentOsMcpToolInput) {
    const artifactType = stringField(input.arguments.artifactType);
    if (this.repository) {
      const artifacts = await this.repository.listArtifacts({
        organizationId: input.context.organizationId,
        conversationId: input.context.conversationId,
        ...(artifactType ? { artifactType } : {}),
      });
      return {
        status: 'succeeded',
        artifactIds: artifacts.map((artifact) => artifact.id),
        artifacts: artifacts.map((artifact) => ({
          id: artifact.id,
          requestId: artifact.requestId,
          runId: artifact.runId,
          toolInvocationId: artifact.toolInvocationId,
          artifactType: artifact.artifactType,
          targetDomain: artifact.targetDomain,
          targetModel: artifact.targetModel,
          targetId: artifact.targetId,
          title: artifact.title,
          href: artifact.href,
          summary: artifact.summary,
          status: artifact.status,
          createdAt: artifact.createdAt.toISOString(),
        })),
      };
    }

    const graph = await this.readTaskGraph(input);
    const artifacts = Array.isArray(graph.artifacts) ? graph.artifacts : [];
    return {
      status: 'succeeded',
      artifactIds: artifacts
        .map((artifact) =>
          isRecord(artifact) && typeof artifact.id === 'string'
            ? artifact.id
            : null,
        )
        .filter((id): id is string => Boolean(id)),
      artifacts,
    };
  }

  private async finalizeTask(input: ExecuteAgentOsMcpToolInput) {
    if (!this.repository) {
      throw new AgentOsRuntimeError(
        'mcp_repository_unavailable',
        'Agent OS repository is unavailable.',
      );
    }
    const status = stringField(input.arguments.status) ?? 'succeeded';
    if (!['succeeded', 'failed'].includes(status)) {
      throw new AgentOsRuntimeError(
        'mcp_finalize_input_invalid',
        'agent_os_finalize_task status must be succeeded or failed.',
      );
    }
    const summaryValue = input.arguments.summary;
    const summary = isRecord(summaryValue)
      ? summaryValue
      : typeof summaryValue === 'string'
        ? { text: summaryValue }
        : {};
    const artifactIds = optionalStringArray(input.arguments.artifactIds);
    if (artifactIds.length > 0) {
      const visibleArtifacts = await this.repository.listArtifacts({
        organizationId: input.context.organizationId,
        conversationId: input.context.conversationId,
      });
      const visibleArtifactIds = new Set(
        visibleArtifacts.map((artifact) => artifact.id),
      );
      const invisibleArtifactIds = artifactIds.filter(
        (artifactId) => !visibleArtifactIds.has(artifactId),
      );
      if (invisibleArtifactIds.length > 0) {
        throw new AgentOsRuntimeError(
          'mcp_finalize_artifact_not_visible',
          `agent_os_finalize_task referenced artifacts outside the current conversation: ${invisibleArtifactIds.join(', ')}`,
        );
      }
    }
    const error = isRecord(input.arguments.error)
      ? input.arguments.error
      : stringField(input.arguments.error)
        ? { message: stringField(input.arguments.error) }
        : null;

    await this.repository.appendRunEvent({
      organizationId: input.context.organizationId,
      runId: input.context.runId,
      agentInstanceId: input.context.agentInstanceId,
      type: 'agent_os.task_finalized',
      data: {
        finalizationTool: 'agent_os_finalize_task',
        status,
        artifactIds,
        summary,
        error,
      },
    });

    return {
      status,
      artifactIds,
      summary,
      error,
    };
  }

  private listAgents() {
    return {
      status: 'succeeded',
      agents: listAgentDefinitions().map((definition) => ({
        type: definition.type,
        name: definition.name,
        description: definition.description,
        runtimeKind: definition.runtimeKind,
        delegationRole: definition.delegationRole,
        defaultSkillKeys: definition.defaultSkillKeys,
        toolKeys: definition.defaultToolPolicies.map((policy) => policy.toolKey),
      })),
    };
  }

  private async createTask(input: ExecuteAgentOsMcpToolInput) {
    if (!this.delegation) {
      throw new AgentOsRuntimeError(
        'mcp_delegation_service_unavailable',
        'Agent OS delegation service is unavailable.',
      );
    }
    const agentType = stringField(input.arguments.agentType);
    if (!agentType) {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        'agent_os_create_task requires agentType.',
      );
    }
    const definition = findAgentDefinitionByType(agentType);
    if (!definition) {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        `Unknown Agent OS agentType: ${agentType}.`,
      );
    }
    const rawTaskInput = input.arguments.taskInput;
    if (!isRecord(rawTaskInput)) {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        'agent_os_create_task requires taskInput object.',
      );
    }

    const playbookKey = stringField(input.arguments.playbookKey);
    if (!playbookKey) {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        'agent_os_create_task requires playbookKey so Hermes owns the orchestration decision.',
      );
    }
    const executeMode = stringField(input.arguments.executeMode);
    if (executeMode !== 'queued' && executeMode !== 'inline') {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        'agent_os_create_task requires executeMode: queued or inline.',
      );
    }
    const planStepKey =
      stringField(input.arguments.planStepKey) ?? `${agentType}_agent`;
    const playbook = findAgentPlaybook(playbookKey);
    if (!playbook) {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        `Unknown Agent OS playbookKey: ${playbookKey}.`,
      );
    }
    const matchingStep = playbook.steps.find(
      (step) => step.agentType === agentType && step.key === planStepKey,
    );
    if (!matchingStep) {
      throw new AgentOsRuntimeError(
        'mcp_create_task_input_invalid',
        `Agent ${agentType} is not allowed for ${playbookKey}/${planStepKey}.`,
      );
    }
    const displayName = stringField(input.arguments.displayName) ?? definition.name;
    const delegated = await this.delegation.delegate({
      organizationId: input.context.organizationId,
      parentAgentType: input.context.agentType,
      agentType,
      conversationId: input.context.conversationId,
      parentRequestId: input.context.requestId,
      delegatedByRunId: input.context.runId,
      requestedByUserId: input.context.requestedByUserId,
      playbookKey,
      planStepKey,
      displayName,
      payload: {
        ...rawTaskInput,
        conversationId: input.context.conversationId,
        requestedByUserId: input.context.requestedByUserId ?? null,
      },
    });
    const execution =
      executeMode === 'inline' &&
      delegated.ok !== false &&
      delegated.requestId &&
      this.runner?.executeRequest
        ? await this.runner.executeRequest({
            organizationId: input.context.organizationId,
            requestId: delegated.requestId,
            workerId: `mcp-${input.context.runId}`,
          })
        : null;
    const status =
      delegated.ok === false ? 'failed' : toInlineChildTaskStatus(execution);

    return {
      status,
      taskId: delegated.requestId ?? null,
      invocationId: execution?.runId ?? null,
      summary: {
        agentType,
        playbookKey,
        planStepKey,
        displayName,
        executeMode,
        execution: execution
          ? {
              executed: execution.executed,
              requestId: execution.requestId ?? null,
              runId: execution.runId ?? null,
              reason: execution.reason ?? null,
            }
          : null,
      },
      error:
        delegated.ok === false || execution?.errorCode
          ? {
              reason:
                delegated.reason ??
                execution?.errorCode ??
                'delegation_failed',
            }
          : undefined,
    };
  }

  private async requestUserInput(input: ExecuteAgentOsMcpToolInput) {
    const question = stringField(input.arguments.question);
    if (!question) {
      throw new AgentOsRuntimeError(
        'mcp_user_input_request_invalid',
        'agent_os_request_user_input requires question.',
      );
    }
    if (!this.repository) {
      throw new AgentOsRuntimeError(
        'mcp_repository_unavailable',
        'Agent OS repository is unavailable.',
      );
    }
    const reason = stringField(input.arguments.reason);
    const summary = {
      question,
      reason,
    };
    await this.repository.markRequestStatus({
      organizationId: input.context.organizationId,
      requestId: input.context.requestId,
      status: 'requires_approval',
      errorCode: 'user_input_required',
      errorMessage: reason ?? question,
    });
    await this.repository.appendRunEvent({
      organizationId: input.context.organizationId,
      runId: input.context.runId,
      agentInstanceId: input.context.agentInstanceId,
      type: 'agent_os.task_finalized',
      data: {
        finalizationTool: 'agent_os_request_user_input',
        status: 'waiting_approval',
        artifactIds: [],
        summary,
        error: null,
      },
    });
    return {
      status: 'waiting_approval',
      summary,
    };
  }

  private async invokeFirstClassDomainTool(input: ExecuteAgentOsMcpToolInput) {
    const resolved = this.toolRegistry.resolveTool(
      input.toolName,
      input.context,
    );
    if (!resolved) {
        throw new AgentOsRuntimeError(
          'mcp_tool_not_registered',
          `MCP tool is not registered: ${input.toolName}`,
        );
    }

    return this.invokeResolvedCapability({
      input,
      capabilityKey: resolved.descriptor.capabilityKey,
      capabilityInput: await this.projectCapabilityInput({
        context: input.context,
        capabilityKey: resolved.descriptor.capabilityKey,
        capabilityInput: input.arguments,
      }),
    });
  }

  private async invokeCapability(input: ExecuteAgentOsMcpToolInput) {
    const { capabilityKey, input: capabilityInput } =
      parseCapabilityInvokeArguments(input.arguments);
    const resolved = this.toolRegistry.resolveCapabilityKey(capabilityKey);
    if (!resolved) {
      throw new AgentOsRuntimeError(
        'mcp_capability_not_exposed',
        `Capability is not exposed to MCP: ${capabilityKey}`,
      );
    }

    return this.invokeResolvedCapability({
      input,
      capabilityKey,
      capabilityInput,
    });
  }

  private async invokeResolvedCapability(input: {
    input: ExecuteAgentOsMcpToolInput;
    capabilityKey: string;
    capabilityInput: Record<string, unknown>;
  }) {
    const result = await this.toolRouter.invoke({
      organizationId: input.input.context.organizationId,
      conversationId: input.input.context.conversationId,
      requestId: input.input.context.requestId,
      runId: input.input.context.runId,
      agentInstanceId: input.input.context.agentInstanceId,
      agentType: input.input.context.agentType,
      requestedByUserId: input.input.context.requestedByUserId,
      capabilityKey: input.capabilityKey,
      input: input.capabilityInput,
    });

    return {
      status: toPublicStatus(result.status),
      invocationId: result.invocation.id,
      approvalRequestId: result.invocation.approvalRequestId,
      artifactIds: result.artifacts.map((artifact) => artifact.id),
      artifacts: result.artifacts.map((artifact) => ({
        id: artifact.id,
        artifactType: artifact.artifactType,
        title: artifact.title,
        summary: artifact.summary,
      })),
    };
  }

  private async projectCapabilityInput(input: {
    context: AgentOsMcpExecutionContext;
    capabilityKey: string;
    capabilityInput: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    if (
      input.capabilityKey !== LISTING_GENERATION_PACKAGE_CAPABILITY ||
      !this.repository
    ) {
      return input.capabilityInput;
    }
    const hasRequiredDirectInput =
      Boolean(stringField(input.capabilityInput.productName)) &&
      optionalStringArray(input.capabilityInput.imageUrls).length > 0;
    if (hasRequiredDirectInput) {
      return input.capabilityInput;
    }

    const artifactIds = collectArtifactIds(input.capabilityInput);
    const sourceUrl =
      stringField(input.capabilityInput.sourceUrl) ??
      stringField(input.capabilityInput.url);
    if (artifactIds.length === 0 && !sourceUrl) {
      return input.capabilityInput;
    }
    const artifacts = await this.repository.listArtifacts({
      organizationId: input.context.organizationId,
      conversationId: input.context.conversationId,
    });
    const visibleArtifacts = artifacts.filter(
      (artifact) =>
        LISTING_SOURCE_ARTIFACT_TYPES.has(artifact.artifactType) &&
        (!artifact.conversationId ||
          artifact.conversationId === input.context.conversationId),
    );
    const sourceArtifact =
      visibleArtifacts.find((artifact) => artifactIds.includes(artifact.id)) ??
      (sourceUrl
        ? visibleArtifacts.find(
            (artifact) => artifactSourceUrl(artifact.summary) === sourceUrl,
          )
        : null);
    if (!sourceArtifact) {
      return input.capabilityInput;
    }

    const projected = listingInputFromArtifactSummary(sourceArtifact.summary);
    return {
      ...projected,
      ...input.capabilityInput,
      productName:
        stringField(input.capabilityInput.productName) ??
        stringField(projected.productName) ??
        input.capabilityInput.productName,
      imageUrls:
        optionalStringArray(input.capabilityInput.imageUrls).length > 0
          ? input.capabilityInput.imageUrls
          : projected.imageUrls,
    };
  }
}
