import { existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../application/port/out/runtime/agent-runtime.port';
import {
  AGENT_OS_REPOSITORY_PORT,
  type AgentOsRepositoryPort,
} from '../../../application/port/out/repository/agent-os-repository.port';
import type { AgentTypeRuntimeHandler } from '../../../application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../application/service/agent-runtime-handler-registry.service';
import { OperatorContextBuilder } from '../../../application/service/operator-context-builder.service';
import { OperatorDecisionExecutor } from '../../../application/service/operator-decision-executor.service';
import { OperatorDecisionParser } from '../../../application/service/operator-decision-parser.service';
import { AgentTaskDelegationService } from '../../../application/service/agent-task-delegation.service';
import { AgentOsRuntimeError } from '../../../domain/agent-os.errors';
import { HermesOperatorRuntimeAdapter } from './hermes-operator-runtime.adapter';
import {
  isRecoverableHermesRuntimeError,
  readLatestHermesTaskFinalization,
  runtimeErrorCode,
} from './hermes-task-finalization';
import {
  loadHermesResumeSession,
  persistHermesRuntimeThread,
} from './hermes-task-session';
import { OpenAiResponsesOperatorRuntimeAdapter } from './openai-responses-operator-runtime.adapter';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectedOperatorRuntime(): string | null {
  const value = process.env.AGENT_OS_OPERATOR_RUNTIME?.trim();
  return value && value.length > 0 ? value : null;
}

function hermesLeafAgentTypesConfigured(): boolean {
  return Boolean(process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES?.trim());
}

function optionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function conversationIdRequired(provider: string): AgentRuntimeResult {
  return {
    provider,
    output: { status: 'blocked', reason: 'conversation_id_required' },
  };
}

function runtimeFailedData(
  provider: string,
  error: unknown,
): Record<string, unknown> {
  return { provider, errorName: error instanceof Error ? error.name : 'unknown' };
}

function renderOperatorPrompt(context: unknown): string {
  return [
    'You are the KidItem Agent OS Operator.',
    'Decide the next orchestration step from the bounded context below.',
    'Return exactly one strict JSON object matching the OperatorDecision schema.',
    'Allowed decision shapes are only:',
    '- delegate sourcing discovery: {"decisionType":"delegate","targetAgentType":"sourcing","playbookKey":"sourcing_market_opportunity_to_order_draft_v1","taskInput":{"keyword":"...","category":null},"userVisibleRationale":"..."}',
    '- delegate manual URL intake: {"decisionType":"delegate","targetAgentType":"sourcing","playbookKey":"manual_product_intake_from_url_v1","taskInput":{"sourceUrl":"https://..."},"userVisibleRationale":"..."}',
    '- delegate listing prep after sourcing artifact/user selection: {"decisionType":"delegate","targetAgentType":"listing","playbookKey":"manual_product_intake_from_url_v1","taskInput":{"productName":"...","imageUrls":["https://..."]},"userVisibleRationale":"..."}',
    '- delegate order draft only after user selection: {"decisionType":"delegate","targetAgentType":"order","playbookKey":"sourcing_market_opportunity_to_order_draft_v1","taskInput":{...},"userVisibleRationale":"..."}',
    '- delegate confirmed channel listing registration: {"decisionType":"delegate","targetAgentType":"channel_registration","playbookKey":"confirmed_channel_listing_registration_v1","taskInput":{"masterId":"...","channelAccountId":"...","externalId":"...","productBarcode":"..."},"userVisibleRationale":"..."}',
    '- delegate Coupang seller-product submission: {"decisionType":"delegate","targetAgentType":"channel_registration","playbookKey":"coupang_listing_submission_v1","taskInput":{"masterId":"...","channelAccountId":"...","productBarcode":"...","listingPayloadJson":"{\\"vendorId\\":\\"...\\",\\"sellerProductName\\":\\"...\\",\\"items\\":[]}"},"userVisibleRationale":"..."}',
    '- delegate purchase order submission: {"decisionType":"delegate","targetAgentType":"order","playbookKey":"purchase_order_submission_v1","taskInput":{"purchaseOrderId":"...","externalOrderPlatform":"ALIBABA_1688","externalOrderId":"...","externalOrderUrl":"https://..."},"userVisibleRationale":"..."}',
    '- ask_user: {"decisionType":"ask_user","question":"...","reason":"..."}',
    '- refuse: {"decisionType":"refuse","reason":"..."}',
    'Use only playbook keys present in context.allowedPlaybooks.',
    'Check context.liveReadiness.blockedCapabilities before delegating live commerce actions; if a required capability is blocked, return ask_user or refuse with the missing setup instead of delegating impossible work.',
    'Do not include planStepKey, displayName, payload, rationale, tool calls, markdown, or prose.',
    '',
    JSON.stringify(context, null, 2),
  ].join('\n');
}

function renderHermesToolLoopPrompt(context: unknown): string {
  return [
    'You are the KidItem Agent OS Operator running in Hermes tool-loop mode.',
    'Use only the KidItem Agent OS MCP tools exposed to this session.',
    'In Hermes, the KidItem MCP tools are exposed with these exact callable names:',
    '- agent_os_read_context -> mcp_kiditem_agent_os_agent_os_read_context',
    '- agent_os_read_task_graph -> mcp_kiditem_agent_os_agent_os_read_task_graph',
    '- agent_os_read_artifacts -> mcp_kiditem_agent_os_agent_os_read_artifacts',
    '- agent_os_finalize_task -> mcp_kiditem_agent_os_agent_os_finalize_task',
    '- agent_os_list_agents -> mcp_kiditem_agent_os_agent_os_list_agents',
    '- agent_os_create_task -> mcp_kiditem_agent_os_agent_os_create_task',
    '- agent_os_request_user_input -> mcp_kiditem_agent_os_agent_os_request_user_input',
    'Your next assistant action must be a tool call, not plain text.',
    'Do not output an OperatorDecision JSON object.',
    'Start by calling mcp_kiditem_agent_os_agent_os_read_context or mcp_kiditem_agent_os_agent_os_read_task_graph.',
    'Create child agent tasks only through mcp_kiditem_agent_os_agent_os_create_task.',
    'Leaf agents cannot create child tasks; if a leaf handoff is needed, the Operator must create it.',
    'Hermes decides which Agent is needed from the user request, task graph, artifacts, and live-readiness context.',
    'Hermes decides whether another Agent is needed after reading child task results.',
    'When child results are needed in the same loop, request inline execution through executeMode: "inline".',
    'Do not submit Coupang listings, register marketplace listings, or submit supplier purchase orders unless the user has approved the external side effect.',
    'Finish by calling mcp_kiditem_agent_os_agent_os_finalize_task exactly once with status, summary, and artifactIds.',
    'Free-form final text is non-authoritative and will be ignored unless mcp_kiditem_agent_os_agent_os_finalize_task succeeds.',
    '',
    JSON.stringify(contextForHermesToolLoop(context), null, 2),
  ].join('\n');
}

function contextForHermesToolLoop(context: unknown): unknown {
  if (!isRecord(context)) return context;
  const projected: Record<string, unknown> = { ...context };
  delete projected.instructionText;
  projected.runtimeContract =
    'Hermes tool-loop: choose Agent OS MCP tool calls, create child tasks through agent_os_create_task, and finish through agent_os_finalize_task.';
  if (isRecord(projected.policy)) {
    projected.policy = {
      ...projected.policy,
      outputFormat: 'kiditem_mcp_tool_loop',
    };
  }
  return projected;
}

function findOperatorDecisionSchemaPath(): string | undefined {
  const configured = process.env.AGENT_OS_OPERATOR_OUTPUT_SCHEMA_PATH?.trim();
  if (configured) return configured;

  const relative = join(
    'agent-config',
    'schemas',
    'operator-decision.schema.json',
  );
  for (const start of [process.cwd(), __dirname]) {
    let current = resolve(start);
    const root = parse(current).root;
    while (true) {
      const candidate = join(current, relative);
      if (existsSync(candidate)) return candidate;
      if (current === root) break;
      current = dirname(current);
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractFirstUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;
  return match[0].replace(/[),.]+$/, '');
}

@Injectable()
export class OperatorRuntimeHandler
  implements AgentTypeRuntimeHandler, OnModuleInit
{
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly delegation: AgentTaskDelegationService,
    private readonly contextBuilder: OperatorContextBuilder,
    private readonly decisionParser: OperatorDecisionParser,
    private readonly decisionExecutor: OperatorDecisionExecutor,
    private readonly openAiRuntime: OpenAiResponsesOperatorRuntimeAdapter,
    private readonly hermesRuntime: HermesOperatorRuntimeAdapter,
    @Inject(AGENT_OS_REPOSITORY_PORT)
    private readonly repository: AgentOsRepositoryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register('manager', this);
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    const runtime = selectedOperatorRuntime();
    if (runtime === 'openai_responses') {
      return this.executeOpenAiResponses(context);
    }
    if (runtime === 'hermes') {
      return this.executeHermes(context);
    }
    if (runtime === 'hermes_tool_loop') {
      return this.executeHermesToolLoop(context);
    }
    if (runtime) {
      throw new AgentOsRuntimeError(
        'operator_runtime_unsupported',
        `Unsupported Agent OS Operator runtime: ${runtime}. Use hermes_tool_loop, hermes, or openai_responses.`,
      );
    }
    if (hermesLeafAgentTypesConfigured()) {
      throw new AgentOsRuntimeError(
        'operator_runtime_required',
        'AGENT_OS_OPERATOR_RUNTIME must be set when Hermes Leaf Agent runtime is configured.',
      );
    }

    const conversationId = stringField(context.input.conversationId);
    if (!conversationId) {
      return conversationIdRequired('kiditem-operator');
    }

    const sourceUrl =
      stringField(context.input.sourceUrl) ??
      stringField(context.input.url) ??
      extractFirstUrl(context.input.userMessage);

    if (sourceUrl) {
      const delegated = await this.delegation.delegate({
        organizationId: context.organizationId,
        parentAgentType: 'manager',
        agentType: 'sourcing',
        conversationId,
        parentRequestId: context.requestId,
        delegatedByRunId: context.runId,
        requestedByUserId: stringField(context.input.requestedByUserId),
        playbookKey: 'manual_product_intake_from_url_v1',
        planStepKey: 'scrape_url',
        displayName: 'Sourcing Agent',
        payload: {
          action: 'manual_url_intake',
          conversationId,
          sourceUrl,
          url: sourceUrl,
        },
      });

      return {
        provider: 'kiditem-operator',
        output: {
          status: 'delegated',
          playbookKey: 'manual_product_intake_from_url_v1',
          delegatedRequestId: delegated.requestId ?? null,
        },
      };
    }

    const keyword = stringField(context.input.keyword) ?? '실리콘 식판';
    const category = stringField(context.input.category);
    const delegated = await this.delegation.delegate({
      organizationId: context.organizationId,
      parentAgentType: 'manager',
      agentType: 'sourcing',
      conversationId,
      parentRequestId: context.requestId,
      delegatedByRunId: context.runId,
      requestedByUserId: stringField(context.input.requestedByUserId),
      playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
      planStepKey: 'sourcing_agent',
      displayName: 'Sourcing Agent',
      payload: {
        action: 'market_opportunity_discovery',
        conversationId,
        keyword,
        category,
      },
    });

    return {
      provider: 'kiditem-operator',
      output: {
        status: 'delegated',
        playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
        delegatedRequestId: delegated.requestId ?? null,
      },
    };
  }

  private async executeOpenAiResponses(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    if (!conversationId) {
      return conversationIdRequired('openai_responses');
    }

    const operatorContext = await this.buildOperatorContext(
      context,
      conversationId,
    );

    await this.appendOperatorEvent(context, 'operator.runtime_started', { provider: 'openai_responses' });

    let runtimeResult: Awaited<ReturnType<OpenAiResponsesOperatorRuntimeAdapter['decide']>>;
    try {
      runtimeResult = await this.openAiRuntime.decide({
        prompt: renderOperatorPrompt(operatorContext),
        apiKey: process.env.OPENAI_API_KEY,
        timeoutMs: optionalPositiveInt(
          process.env.AGENT_OS_OPENAI_RESPONSES_TIMEOUT_MS,
        ),
        baseUrl: process.env.AGENT_OS_OPENAI_RESPONSES_BASE_URL,
        outputSchemaPath: findOperatorDecisionSchemaPath(),
        model: process.env.AGENT_OS_OPENAI_RESPONSES_MODEL ?? context.model,
      });
    } catch (error) {
      await this.appendOperatorEvent(context, 'operator.runtime_failed', runtimeFailedData('openai_responses', error));
      throw error;
    }

    await this.appendOperatorEvent(context, 'operator.runtime_completed', {
      provider: runtimeResult.provider,
      durationMs: runtimeResult.durationMs,
      responseId: runtimeResult.responseId,
      inputTokens: runtimeResult.inputTokens ?? null,
      outputTokens: runtimeResult.outputTokens ?? null,
      cachedInputTokens: runtimeResult.cachedInputTokens ?? null,
    });

    return this.executeParsedDecision({
      context,
      conversationId,
      provider: runtimeResult.provider,
      rawOutput: runtimeResult.rawOutput,
    });
  }

  private async executeHermes(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    if (!conversationId) {
      return conversationIdRequired('hermes');
    }

    const operatorContext = await this.buildOperatorContext(
      context,
      conversationId,
    );
    const resumeSessionId = await loadHermesResumeSession({
      repository: this.repository,
      organizationId: context.organizationId,
      taskSessionId: context.taskSessionId,
    });

    await this.appendOperatorEvent(context, 'operator.runtime_started', { provider: 'hermes' });

    let runtimeResult:
      | Awaited<ReturnType<HermesOperatorRuntimeAdapter['decide']>>
      | null = null;
    let recoverableRuntimeError: unknown = null;
    try {
      runtimeResult = await this.hermesRuntime.decide({
        organizationId: context.organizationId,
        conversationId,
        requestId: context.requestId,
        runId: context.runId,
        agentInstanceId: context.agentInstanceId,
        agentType: context.agentType,
        taskSessionId: context.taskSessionId,
        requestedByUserId: stringField(context.input.requestedByUserId),
        resumeSessionId,
        prompt: renderOperatorPrompt(operatorContext),
        hermesPath: process.env.AGENT_OS_HERMES_PATH,
        hermesHome: process.env.AGENT_OS_HERMES_HOME,
        timeoutMs: optionalPositiveInt(process.env.AGENT_OS_HERMES_TIMEOUT_MS),
        model: process.env.AGENT_OS_HERMES_MODEL ?? context.model,
        provider: process.env.AGENT_OS_HERMES_PROVIDER,
      });
    } catch (error) {
      await this.appendOperatorEvent(context, 'operator.runtime_failed', runtimeFailedData('hermes', error));
      throw error;
    }

    await persistHermesRuntimeThread({
      repository: this.repository,
      organizationId: context.organizationId,
      taskSessionId: context.taskSessionId,
      sessionId: runtimeResult.sessionId,
    });

    await this.appendOperatorEvent(context, 'operator.runtime_completed', {
      provider: runtimeResult.provider,
      durationMs: runtimeResult.durationMs,
      stdoutBytes: Buffer.byteLength(runtimeResult.rawOutput),
      stderrBytes: Buffer.byteLength(runtimeResult.stderr),
      sessionId: runtimeResult.sessionId ?? null,
    });

    return this.executeParsedDecision({
      context,
      conversationId,
      provider: runtimeResult.provider,
      rawOutput: runtimeResult.rawOutput,
    });
  }

  private async executeHermesToolLoop(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    if (!conversationId) {
      return conversationIdRequired('hermes_tool_loop');
    }

    const operatorContext = await this.buildOperatorContext(
      context,
      conversationId,
    );
    const resumeSessionId = await loadHermesResumeSession({
      repository: this.repository,
      organizationId: context.organizationId,
      taskSessionId: context.taskSessionId,
    });

    await this.appendOperatorEvent(context, 'operator.runtime_started', {
      provider: 'hermes_tool_loop',
    });

    let runtimeResult:
      | Awaited<ReturnType<HermesOperatorRuntimeAdapter['decide']>>
      | null = null;
    let recoverableRuntimeError: unknown = null;
    try {
      runtimeResult = await this.hermesRuntime.decide({
        organizationId: context.organizationId,
        conversationId,
        requestId: context.requestId,
        runId: context.runId,
        agentInstanceId: context.agentInstanceId,
        agentType: context.agentType,
        taskSessionId: context.taskSessionId,
        requestedByUserId: stringField(context.input.requestedByUserId),
        resumeSessionId,
        prompt: renderHermesToolLoopPrompt(operatorContext),
        hermesPath: process.env.AGENT_OS_HERMES_PATH,
        hermesHome: process.env.AGENT_OS_HERMES_HOME,
        timeoutMs: optionalPositiveInt(process.env.AGENT_OS_HERMES_TIMEOUT_MS),
        model: process.env.AGENT_OS_HERMES_MODEL ?? context.model,
        provider: process.env.AGENT_OS_HERMES_PROVIDER,
        enableKidItemMcp: true,
      });
    } catch (error) {
      if (!isRecoverableHermesRuntimeError(error)) {
        await this.appendOperatorEvent(
          context,
          'operator.runtime_failed',
          runtimeFailedData('hermes_tool_loop', error),
        );
        throw error;
      }
      recoverableRuntimeError = error;
    }

    try {
      const finalization = await readLatestHermesTaskFinalization({
        repository: this.repository,
        organizationId: context.organizationId,
        runId: context.runId,
        acceptedFinalizationTools: [
          'agent_os_finalize_task',
          'agent_os_request_user_input',
        ],
      });
      if (!finalization) {
        throw new AgentOsRuntimeError(
          recoverableRuntimeError
            ? 'operator_runtime_finalization_missing_after_timeout'
            : 'operator_runtime_finalization_missing',
          recoverableRuntimeError
            ? 'Hermes tool-loop runtime timed out before agent_os_finalize_task was recorded.'
            : 'Hermes tool-loop runtime exited without agent_os_finalize_task.',
        );
      }
      if (
        finalization.status !== 'succeeded' &&
        finalization.status !== 'waiting_approval'
      ) {
        throw new AgentOsRuntimeError(
          'operator_runtime_task_failed',
          stringField(finalization.error?.message) ??
            'Hermes tool-loop task finalized as failed.',
        );
      }

      if (runtimeResult) {
        await persistHermesRuntimeThread({
          repository: this.repository,
          organizationId: context.organizationId,
          taskSessionId: context.taskSessionId,
          sessionId: runtimeResult.sessionId,
        });
      }

      await this.appendOperatorEvent(context, 'operator.runtime_completed', {
        provider: 'hermes_tool_loop',
        hermesProvider: runtimeResult?.provider ?? null,
        durationMs: runtimeResult?.durationMs ?? null,
        stdoutBytes:
          runtimeResult === null
            ? null
            : Buffer.byteLength(runtimeResult.rawOutput),
        stderrBytes:
          runtimeResult === null
            ? null
            : Buffer.byteLength(runtimeResult.stderr),
        finalizationEventId: finalization.id,
        finalizationStatus: finalization.status,
        reconciledAfterRuntimeError: recoverableRuntimeError !== null,
        runtimeErrorCode: runtimeErrorCode(recoverableRuntimeError),
        sessionId: runtimeResult?.sessionId ?? null,
      });

      return {
        provider: 'hermes_tool_loop',
        output: {
          status: finalization.status,
          artifactIds: finalization.artifactIds,
          summary: finalization.summary,
          finalizationEventId: finalization.id,
        },
      };
    } catch (error) {
      await this.appendOperatorEvent(
        context,
        'operator.runtime_failed',
        runtimeFailedData('hermes_tool_loop', error),
      );
      throw error;
    }
  }

  private async buildOperatorContext(
    context: AgentRuntimeExecutionContext,
    conversationId: string,
  ): Promise<Awaited<ReturnType<OperatorContextBuilder['build']>>> {
    const operatorContext = await this.contextBuilder.build({
      organizationId: context.organizationId,
      conversationId,
      requestId: context.requestId,
      activeUserMessage: stringField(context.input.userMessage),
    });
    await this.appendOperatorEvent(context, 'operator.context_built', {
      conversationId,
      recentMessageCount: operatorContext.recentMessages.length,
      nodeCount: operatorContext.runGraph.nodes.length,
      artifactCount: operatorContext.runGraph.artifacts.length,
    });
    return operatorContext;
  }

  private async executeParsedDecision(input: {
    context: AgentRuntimeExecutionContext;
    conversationId: string;
    provider: string;
    rawOutput: string;
  }): Promise<AgentRuntimeResult> {
    let decision: ReturnType<OperatorDecisionParser['parse']>;
    try {
      decision = this.decisionParser.parse(input.rawOutput);
    } catch (error) {
      await this.appendOperatorEvent(input.context, 'operator.decision_rejected', {
        errorName: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }

    await this.appendOperatorEvent(input.context, 'operator.decision_parsed', {
      decisionType: decision.decisionType,
      targetAgentType:
        decision.decisionType === 'delegate' ? decision.targetAgentType : null,
    });

    const execution = await this.decisionExecutor.execute({
      organizationId: input.context.organizationId,
      conversationId: input.conversationId,
      parentRequestId: input.context.requestId,
      delegatedByRunId: input.context.runId,
      operatorAgentInstanceId: input.context.agentInstanceId,
      requestedByUserId: stringField(input.context.input.requestedByUserId),
      decision,
    });

    return {
      provider: input.provider,
      output: { ...execution },
    };
  }

  private async appendOperatorEvent(
    context: AgentRuntimeExecutionContext,
    type: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.appendRunEvent({
      organizationId: context.organizationId,
      runId: context.runId,
      agentInstanceId: context.agentInstanceId,
      type,
      data,
    });
  }

}
