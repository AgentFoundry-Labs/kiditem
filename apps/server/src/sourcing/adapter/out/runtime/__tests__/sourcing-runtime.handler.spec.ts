import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcingRuntimeHandler } from '../sourcing-runtime.handler';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function context(input: Record<string, unknown>) {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'agent-sourcing-1',
    agentType: 'sourcing',
    requestId: 'request-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'listing-prep',
    adapterType: 'claude_local',
    model: 'gpt-test',
    modelPlan: { primary: 'gpt-test' },
    promptPath: 'agent-config/prompts/agents/sourcing.md',
    input,
    trustLevel: 5,
    runtimeConfig: {},
  };
}

function listingContext(input: Record<string, unknown>) {
  return {
    ...context(input),
    agentInstanceId: 'agent-listing-1',
    agentType: 'listing',
    promptPath: 'agent-config/prompts/agents/listing.md',
  };
}

describe('SourcingRuntimeHandler', () => {
  it('registers both sourcing and listing Agent OS runtime handlers', () => {
    const registry = { register: vi.fn() };
    const toolRouter = { invoke: vi.fn() };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    handler.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith('sourcing', handler);
    expect(registry.register).toHaveBeenCalledWith('listing', handler);
  });

  it('does not register deterministic handlers for Hermes-owned Leaf agents', () => {
    process.env.AGENT_OS_HERMES_LEAF_AGENT_TYPES = 'sourcing,listing';
    const registry = { register: vi.fn() };
    const toolRouter = { invoke: vi.fn() };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    handler.onModuleInit();

    expect(registry.register).not.toHaveBeenCalledWith('sourcing', handler);
    expect(registry.register).not.toHaveBeenCalledWith('listing', handler);
  });

  it('passes supplier URLs into the 1688 supplier matching capability', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'succeeded',
        invocation: { id: 'tool-1' },
        artifacts: [],
      }),
    };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    await handler.execute(
      context({
        action: 'market_opportunity_discovery',
        keyword: '실리콘 식판',
        supplierUrl: 'https://detail.1688.com/offer/123.html',
      }),
    );

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityKey: 'supplier1688.match_products',
        input: expect.objectContaining({
          keyword: '실리콘 식판',
          supplierUrl: 'https://detail.1688.com/offer/123.html',
        }),
      }),
    );
  });

  it('routes manual URL intake through the sourcing scrape workflow capability', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'succeeded',
        invocation: { id: 'tool-scrape-1' },
        artifacts: [{ id: 'artifact-scrape-1' }],
      }),
    };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    const result = await handler.execute(
      context({
        action: 'manual_url_intake',
        sourceUrl: 'https://detail.1688.com/offer/123.html',
        requestedByUserId: 'user-1',
      }),
    );

    expect(playwright.execute).not.toHaveBeenCalled();
    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        capabilityKey: 'sourcing.scrapeUrlWorkflow',
        requestedByUserId: 'user-1',
        input: {
          sourceUrl: 'https://detail.1688.com/offer/123.html',
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-sourcing-manual-url-intake',
      output: {
        action: 'manual_url_intake',
        toolInvocationIds: ['tool-scrape-1'],
        artifactIds: ['artifact-scrape-1'],
        status: 'scrape_workflow_started',
      },
    });
  });

  it('invokes the listing-prep capability for product listing generation packages', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'succeeded',
        invocation: { id: 'tool-1' },
        artifacts: [{ id: 'artifact-1' }],
      }),
    };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    const result = await handler.execute(
      context({
        action: 'product_listing_generation_package',
        productName: '실리콘 흡착 식판',
        imageUrls: ['https://cdn.example.com/plate.jpg'],
        requestedByUserId: 'user-1',
      }),
    );

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: null,
        agentInstanceId: 'agent-sourcing-1',
        agentType: 'sourcing',
        requestId: 'request-1',
        runId: 'run-1',
        capabilityKey: 'product_listing.create_generation_package',
        requestedByUserId: 'user-1',
        input: {
          productName: '실리콘 흡착 식판',
          imageUrls: ['https://cdn.example.com/plate.jpg'],
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-sourcing-listing-prep',
      output: {
        action: 'product_listing_generation_package',
        toolInvocationIds: ['tool-1'],
        artifactIds: ['artifact-1'],
        status: 'listing_prep_started',
      },
    });
  });

  it('runs listing agent tasks as listing-prep package creation by default', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'succeeded',
        invocation: { id: 'tool-listing-1' },
        artifacts: [{ id: 'artifact-listing-1' }],
      }),
    };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    const result = await handler.execute(
      listingContext({
        productName: '무선 RC카',
        imageUrls: ['https://cdn.example.com/car.jpg'],
        requestedByUserId: 'user-1',
      }),
    );

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        agentInstanceId: 'agent-listing-1',
        agentType: 'listing',
        capabilityKey: 'product_listing.create_generation_package',
        input: {
          productName: '무선 RC카',
          imageUrls: ['https://cdn.example.com/car.jpg'],
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-sourcing-listing-prep',
      output: {
        action: 'product_listing_generation_package',
        toolInvocationIds: ['tool-listing-1'],
        artifactIds: ['artifact-listing-1'],
        status: 'listing_prep_started',
      },
    });
  });

  it('invokes approval-gated Wing thumbnail registration through Tool Router', async () => {
    const registry = { register: vi.fn() };
    const toolRouter = {
      invoke: vi.fn().mockResolvedValue({
        status: 'waiting_approval',
        invocation: { id: 'tool-wing-1' },
        artifacts: [],
      }),
    };
    const playwright = { execute: vi.fn() };
    const handler = new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
    );

    const result = await handler.execute(
      context({
        action: 'wing_thumbnail_registration',
        generationId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        conversationId: 'conversation-1',
        requestedByUserId: 'user-1',
      }),
    );

    expect(toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-sourcing-1',
        agentType: 'sourcing',
        requestId: 'request-1',
        runId: 'run-1',
        capabilityKey: 'product_listing.submit_wing_thumbnail',
        requestedByUserId: 'user-1',
        input: {
          generationId: '0187e942-9098-7382-9a22-c5b821f2f5d1',
        },
      }),
    );
    expect(result).toEqual({
      provider: 'kiditem-sourcing-wing-registration',
      output: {
        action: 'wing_thumbnail_registration',
        toolInvocationIds: ['tool-wing-1'],
        artifactIds: [],
        status: 'waiting_approval',
      },
    });
  });
});
