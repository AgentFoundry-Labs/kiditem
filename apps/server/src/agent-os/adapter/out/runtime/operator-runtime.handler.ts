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
import { OpenAiResponsesOperatorRuntimeAdapter } from './openai-responses-operator-runtime.adapter';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectedOperatorRuntime(): string | null {
  const value = process.env.AGENT_OS_OPERATOR_RUNTIME?.trim();
  return value && value.length > 0 ? value : null;
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

function sourcingKeywordRequired(provider: string): AgentRuntimeResult {
  return {
    provider,
    output: { status: 'blocked', reason: 'sourcing_keyword_required' },
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
    '- delegate sourcing research: {"decisionType":"delegate","targetAgentType":"sourcing","playbookKey":"sourcing_market_research_v2","taskInput":{"keyword":"...","category":null},"userVisibleRationale":"..."}',
    '- delegate manual URL intake: {"decisionType":"delegate","targetAgentType":"sourcing","playbookKey":"manual_product_intake_from_url_v2","taskInput":{"sourceUrl":"https://..."},"userVisibleRationale":"..."}',
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
    if (runtime) {
      throw new AgentOsRuntimeError(
        'operator_runtime_unsupported',
        `Unsupported Agent OS Operator runtime: ${runtime}. ` +
          'Use openai_responses or omit AGENT_OS_OPERATOR_RUNTIME for the deterministic path.',
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
        playbookKey: 'manual_product_intake_from_url_v2',
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
          playbookKey: 'manual_product_intake_from_url_v2',
          delegatedRequestId: delegated.requestId ?? null,
        },
      };
    }

    const keyword = stringField(context.input.keyword);
    if (!keyword) {
      return sourcingKeywordRequired('kiditem-operator');
    }
    const category = stringField(context.input.category);
    const delegated = await this.delegation.delegate({
      organizationId: context.organizationId,
      parentAgentType: 'manager',
      agentType: 'sourcing',
      conversationId,
      parentRequestId: context.requestId,
      delegatedByRunId: context.runId,
      requestedByUserId: stringField(context.input.requestedByUserId),
      playbookKey: 'sourcing_market_research_v2',
      planStepKey: 'sourcing_agent',
      displayName: 'Sourcing Agent',
      payload: {
        action: 'market_research',
        conversationId,
        keyword,
        category,
      },
    });

    return {
      provider: 'kiditem-operator',
      output: {
        status: 'delegated',
        playbookKey: 'sourcing_market_research_v2',
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
