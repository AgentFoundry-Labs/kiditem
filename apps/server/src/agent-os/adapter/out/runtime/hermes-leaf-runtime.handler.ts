import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../application/port/out/runtime/agent-runtime-handler.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../../../application/port/out/repository/agent-os-repository.port';
import { AgentRuntimeHandlerRegistry } from '../../../application/service/agent-runtime-handler-registry.service';
import { modelFacingMcpToolNamesForAgentType } from '../../../application/service/kiditem-mcp-tool-registry.service';
import { OperatorContextBuilder } from '../../../application/service/operator-context-builder.service';
import { findAgentDefinitionByType } from '../../../domain/agent-definition.registry';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { HermesOperatorRuntimeAdapter } from './hermes-operator-runtime.adapter';
import {
  isRecoverableHermesRuntimeError,
  readLatestHermesTaskFinalization,
} from './hermes-task-finalization';

function configuredLeafAgentTypes(): string[] {
  return (process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function timeoutMs(): number | undefined {
  const value = Number(process.env.AGENT_OS_HERMES_TIMEOUT_MS);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function hermesCallableName(toolName: string): string {
  return `mcp_kiditem_agent_os_${toolName}`;
}

function renderLeafPrompt(input: {
  agentType: string;
  context: unknown;
  toolNames: string[];
}): string {
  return [
    `Hermes is the active KidItem ${input.agentType} Leaf Agent.`,
    'KidItem is Oracle, Gatekeeper, Ledger, and MCP Adapter.',
    'Use only the KidItem Agent OS MCP tools exposed to this session.',
    'Your next assistant action must be a tool call, not plain text.',
    'Do not create child Agent tasks. If another Agent is needed, finalize with a handoff intent for the Operator.',
    'Use the available domain tools to complete this task, then call the finalize-task MCP tool exactly once.',
    'Free-form final text is non-authoritative and will be ignored unless finalize-task succeeds.',
    '',
    'Callable MCP tools:',
    ...input.toolNames.map(
      (toolName) => `- ${toolName} -> ${hermesCallableName(toolName)}`,
    ),
    '',
    JSON.stringify(input.context, null, 2),
  ].join('\n');
}

@Injectable()
export class HermesLeafRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly hermesRuntime: HermesOperatorRuntimeAdapter,
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
    private readonly contextBuilder: OperatorContextBuilder,
  ) {}

  onModuleInit(): void {
    for (const agentType of configuredLeafAgentTypes()) {
      const definition = findAgentDefinitionByType(agentType);
      if (!definition || definition.delegationRole === 'orchestrator') continue;
      this.registry.register(agentType, this);
    }
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    if (!conversationId) {
      throw new AgentOsRuntimeError(
        'conversation_id_required',
        'Hermes Leaf runtime requires conversationId in task input.',
      );
    }

    const boundedContext = await this.contextBuilder.build({
      organizationId: context.organizationId,
      conversationId,
      requestId: context.requestId,
      activeUserMessage: stringField(context.input.userMessage),
    });
    let result: Awaited<ReturnType<HermesOperatorRuntimeAdapter['decide']>> | null =
      null;
    let recoveredAfterRuntimeError = false;
    try {
      result = await this.hermesRuntime.decide({
        organizationId: context.organizationId,
        conversationId,
        requestId: context.requestId,
        runId: context.runId,
        agentInstanceId: context.agentInstanceId,
        agentType: context.agentType,
        taskSessionId: context.taskSessionId,
        requestedByUserId: stringField(context.input.requestedByUserId),
        prompt: renderLeafPrompt({
          agentType: context.agentType,
          context: {
            ...boundedContext,
            currentTaskInput: context.input,
          },
          toolNames: modelFacingMcpToolNamesForAgentType(context.agentType),
        }),
        model: process.env.AGENT_OS_HERMES_MODEL ?? context.model,
        provider: process.env.AGENT_OS_HERMES_PROVIDER,
        hermesPath: process.env.AGENT_OS_HERMES_PATH,
        hermesHome: process.env.AGENT_OS_HERMES_HOME,
        timeoutMs: timeoutMs(),
        enableKidItemMcp: true,
      });
    } catch (error) {
      if (!isRecoverableHermesRuntimeError(error)) throw error;
      recoveredAfterRuntimeError = true;
    }

    const finalization = await readLatestHermesTaskFinalization({
      repository: this.repository,
      organizationId: context.organizationId,
      runId: context.runId,
      acceptedFinalizationTools: ['agent_os_finalize_task'],
    });
    if (!finalization) {
      throw new AgentOsRuntimeError(
        recoveredAfterRuntimeError
          ? 'operator_runtime_finalization_missing_after_timeout'
          : 'operator_runtime_finalization_missing',
        recoveredAfterRuntimeError
          ? 'Hermes Leaf runtime timed out before agent_os_finalize_task was recorded.'
          : 'Hermes Leaf runtime exited without agent_os_finalize_task.',
      );
    }
    if (finalization.status === 'failed') {
      throw new AgentOsRuntimeError(
        'operator_runtime_failed',
        stringField(finalization.error?.message) ??
          'Hermes Leaf finalized with failed status.',
      );
    }

    return {
      provider: result?.provider ?? 'hermes',
      output: {
        status: finalization.status,
        artifactIds: finalization.artifactIds,
        summary: finalization.summary,
        finalizationEventId: finalization.id,
      },
      logExcerpt: result?.rawOutput ?? '',
    };
  }
}
