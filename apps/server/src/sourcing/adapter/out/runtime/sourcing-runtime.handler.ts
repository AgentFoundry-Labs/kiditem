import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AgentRuntimeExecutionContext,
  AgentRuntimeResult,
} from '../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import type { AgentTypeRuntimeHandler } from '../../../../agent-os/application/port/out/runtime/agent-runtime-handler.port';
import { AgentRuntimeHandlerRegistry } from '../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentToolRouter } from '../../../../agent-os/application/service/agent-tool-router.service';
import { AgentOsRuntimeError } from '../../../../agent-os/domain/agent-os.errors';
import {
  SourcingScrapeResultError,
  SourcingScrapeResultService,
} from '../../../application/service/sourcing-scrape-result.service';
import { SourcingPlaywrightRuntimeHandler } from './sourcing-playwright-runtime.handler';

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

@Injectable()
export class SourcingRuntimeHandler implements AgentTypeRuntimeHandler, OnModuleInit {
  constructor(
    private readonly registry: AgentRuntimeHandlerRegistry,
    private readonly toolRouter: AgentToolRouter,
    private readonly playwright: SourcingPlaywrightRuntimeHandler,
    private readonly scrapeResults: SourcingScrapeResultService,
  ) {}

  onModuleInit(): void {
    this.registry.register('sourcing', this);
    this.registry.register('listing', this);
  }

  supports(context: AgentRuntimeExecutionContext): boolean {
    if (context.agentType === 'listing') return true;
    return context.agentType === 'sourcing' && context.input.action === 'scrape_url';
  }

  async execute(context: AgentRuntimeExecutionContext): Promise<AgentRuntimeResult> {
    if (context.agentType === 'listing') {
      return this.executeProductListingGenerationPackage(context);
    }
    if (context.agentType === 'sourcing' && context.input.action === 'scrape_url') {
      return this.executeScrapeUrl(context);
    }
    throw new AgentOsRuntimeError(
      'sourcing_unknown_action',
      `Unknown sourcing action: ${stringField(context.input.action) ?? '(missing)'}`,
    );
  }

  private async executeScrapeUrl(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const scraped = await this.playwright.execute(context);
    try {
      const persisted = await this.scrapeResults.persist({
        organizationId: context.organizationId,
        triggeredByUserId: context.requestedByUserId,
        output: scraped.output,
      });
      return {
        ...scraped,
        output: {
          ...scraped.output,
          candidateId: persisted.candidateId,
          href: persisted.href,
        },
      };
    } catch (error) {
      if (error instanceof SourcingScrapeResultError) {
        throw new AgentOsRuntimeError(error.code, error.message);
      }
      throw error;
    }
  }

  private async executeProductListingGenerationPackage(
    context: AgentRuntimeExecutionContext,
  ): Promise<AgentRuntimeResult> {
    const result = await this.toolRouter.invoke({
      organizationId: context.organizationId,
      conversationId: context.conversationId,
      agentInstanceId: context.agentInstanceId,
      agentType: context.agentType,
      requestId: context.requestId,
      runId: context.runId,
      requestedByUserId: context.requestedByUserId,
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
}
