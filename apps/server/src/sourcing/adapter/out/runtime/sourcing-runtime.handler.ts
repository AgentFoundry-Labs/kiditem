import { Injectable, OnModuleInit } from '@nestjs/common';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from '../../../../agent-os/application/service/agent-tool-router.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import { SourcingPlaywrightRuntimeHandler } from './sourcing-playwright-runtime.handler';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function listingPrepInput(input: Record<string, unknown>): Record<string, unknown> {
  const {
    action,
    conversationId,
    operatorRationale,
    requestedByUserId,
    ...capabilityInput
  } = input;
  void action;
  void conversationId;
  void operatorRationale;
  void requestedByUserId;
  return capabilityInput;
}

function manualUrlInput(input: Record<string, unknown>): Record<string, unknown> {
  const sourceUrl = stringField(input.sourceUrl) ?? stringField(input.url);
  return sourceUrl ? { sourceUrl } : {};
}

function wingRegistrationInput(input: Record<string, unknown>): Record<string, unknown> {
  const generationId = stringField(input.generationId);
  return generationId ? { generationId } : {};
}

function supplierUrlInput(input: Record<string, unknown>): Record<string, unknown> {
  const sourceUrl = stringField(input.sourceUrl);
  const supplierUrl = stringField(input.supplierUrl);
  const url = stringField(input.url);
  const supplierUrls = Array.isArray(input.supplierUrls)
    ? input.supplierUrls.filter(
        (value): value is string => typeof value === 'string' && Boolean(value.trim()),
      )
    : [];
  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(supplierUrl ? { supplierUrl } : {}),
    ...(url ? { url } : {}),
    ...(supplierUrls.length > 0 ? { supplierUrls } : {}),
  };
}

function assertToolInvocationDidNotFail(
  result: Awaited<ReturnType<AgentToolRouter['invoke']>>,
): void {
  if (result.status !== 'failed') return;
  throw new AgentOsRuntimeError(
    result.invocation.errorCode ?? 'capability_failed',
    result.invocation.errorMessage ??
      `Capability failed: ${result.invocation.capabilityKey}`,
  );
}

function hermesLeafOwns(agentType: string): boolean {
  return (process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES ?? '')
    .split(',')
    .map((value) => value.trim())
    .includes(agentType);
}

@Injectable()
export class SourcingRuntimeHandler implements AgentTypeRuntimeHandler, OnModuleInit {
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly toolRouter: AgentToolRouter,
    private readonly playwright: SourcingPlaywrightRuntimeHandler,
  ) {}

  onModuleInit(): void {
    if (!hermesLeafOwns('sourcing')) {
      this.registry.register('sourcing', this);
    }
    if (!hermesLeafOwns('listing')) {
      this.registry.register('listing', this);
    }
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    if (context.agentType === 'listing') {
      return this.executeProductListingGenerationPackage(context);
    }

    const action = stringField(context.input.action);
    if (action === 'scrape_url') {
      return this.playwright.execute(context);
    }
    if (action === 'market_opportunity_discovery') {
      return this.executeMarketOpportunityDiscovery(context);
    }
    if (action === 'manual_url_intake') {
      return this.executeManualUrlIntake(context);
    }
    if (action === 'product_listing_generation_package') {
      return this.executeProductListingGenerationPackage(context);
    }
    if (action === 'wing_thumbnail_registration') {
      return this.executeWingThumbnailRegistration(context);
    }
    throw new AgentOsRuntimeError(
      'sourcing_unknown_action',
      `Unknown sourcing action: ${action ?? '(missing)'}`,
    );
  }

  private async executeMarketOpportunityDiscovery(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const keyword = stringField(context.input.keyword) ?? '실리콘 식판';
    const category = stringField(context.input.category);
    const conversationId = stringField(context.input.conversationId);
    const common = {
      organizationId: context.organizationId,
      conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      input: { keyword, category, mode: 'replay', ...supplierUrlInput(context.input) },
    };

    const market = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'market.collect_keyword_category_rankings',
    });
    assertToolInvocationDidNotFail(market);
    const coupang = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'coupang.match_products',
    });
    assertToolInvocationDidNotFail(coupang);
    const tracking = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'coupang.collect_tracking_snapshot',
    });
    assertToolInvocationDidNotFail(tracking);
    const supplier = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'supplier1688.match_products',
    });
    assertToolInvocationDidNotFail(supplier);
    const score = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'sourcing.score_opportunities',
    });
    assertToolInvocationDidNotFail(score);
    const recommendation = await this.toolRouter.invoke({
      ...common,
      capabilityKey: 'sourcing.create_recommendation_packet',
    });
    assertToolInvocationDidNotFail(recommendation);

    return {
      provider: 'kiditem-sourcing-replay',
      output: {
        action: 'market_opportunity_discovery',
        keyword,
        category: category ?? null,
        toolInvocationIds: [
          market.invocation.id,
          coupang.invocation.id,
          tracking.invocation.id,
          supplier.invocation.id,
          score.invocation.id,
          recommendation.invocation.id,
        ],
        artifactIds: recommendation.artifacts.map((artifact) => artifact.id),
        status: 'awaiting_selection',
      },
    };
  }

  private async executeManualUrlIntake(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    const requestedByUserId = stringField(context.input.requestedByUserId);
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      requestedByUserId,
      capabilityKey: 'sourcing.scrapeUrlWorkflow',
      input: manualUrlInput(context.input),
    });
    assertToolInvocationDidNotFail(result);

    return {
      provider: 'kiditem-sourcing-manual-url-intake',
      output: {
        action: 'manual_url_intake',
        toolInvocationIds: [result.invocation.id],
        artifactIds: result.artifacts.map((artifact) => artifact.id),
        status: 'scrape_workflow_started',
      },
    };
  }

  private async executeProductListingGenerationPackage(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    const requestedByUserId = stringField(context.input.requestedByUserId);
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      requestedByUserId,
      capabilityKey: 'product_listing.create_generation_package',
      input: listingPrepInput(context.input),
    });
    assertToolInvocationDidNotFail(result);

    return {
      provider: 'kiditem-sourcing-listing-prep',
      output: {
        action: 'product_listing_generation_package',
        toolInvocationIds: [result.invocation.id],
        artifactIds: result.artifacts.map((artifact) => artifact.id),
        status: 'listing_prep_started',
      },
    };
  }

  private async executeWingThumbnailRegistration(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const conversationId = stringField(context.input.conversationId);
    const requestedByUserId = stringField(context.input.requestedByUserId);
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      requestedByUserId,
      capabilityKey: 'product_listing.submit_wing_thumbnail',
      input: wingRegistrationInput(context.input),
    });
    assertToolInvocationDidNotFail(result);

    return {
      provider: 'kiditem-sourcing-wing-registration',
      output: {
        action: 'wing_thumbnail_registration',
        toolInvocationIds: [result.invocation.id],
        artifactIds: result.artifacts.map((artifact) => artifact.id),
        status:
          result.status === 'waiting_approval'
            ? 'waiting_approval'
            : 'wing_registration_submitted',
      },
    };
  }
}
