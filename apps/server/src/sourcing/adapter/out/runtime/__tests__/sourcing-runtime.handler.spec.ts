import { describe, expect, it, vi } from 'vitest';
import { SourcingRuntimeHandler } from '../sourcing-runtime.handler';

function context(input: Record<string, unknown>) {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'agent-sourcing-1',
    agentType: 'sourcing',
    requestId: 'request-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'sourcing',
    adapterType: 'codex_cli',
    model: 'gpt-test',
    modelPlan: { primary: 'gpt-test' },
    promptPath: 'agent-config/prompts/agents/sourcing.md',
    conversationId: null,
    requestedByUserId: 'user-1',
    skillKeys: [],
    outputSchemaPath: null,
    input,
    trustLevel: 5,
    runtimeConfig: {},
  };
}

function handler(overrides: {
  toolRouter?: { invoke: ReturnType<typeof vi.fn> };
  playwright?: { execute: ReturnType<typeof vi.fn> };
  scrapeResults?: { persist: ReturnType<typeof vi.fn> };
} = {}) {
  const registry = { register: vi.fn() };
  const toolRouter = overrides.toolRouter ?? { invoke: vi.fn() };
  const playwright = overrides.playwright ?? { execute: vi.fn() };
  const scrapeResults = overrides.scrapeResults ?? { persist: vi.fn() };
  return {
    registry,
    toolRouter,
    playwright,
    scrapeResults,
    value: new SourcingRuntimeHandler(
      registry as never,
      toolRouter as never,
      playwright as never,
      scrapeResults as never,
    ),
  };
}

describe('SourcingRuntimeHandler', () => {
  it('persists a scrape result before returning Agent OS success', async () => {
    const runtime = handler({
      playwright: { execute: vi.fn().mockResolvedValue({
        provider: 'ts-playwright',
        output: {
          ok: true,
          scraped_data: {
            source_url: 'https://detail.1688.com/offer/123.html',
            title: '실리콘 식판',
          },
        },
      }) },
      scrapeResults: { persist: vi.fn().mockResolvedValue({
        candidateId: 'candidate-1',
        href: '/product-pipeline/collected-products/candidate-1',
      }) },
    });

    const result = await runtime.value.execute(context({
      action: 'scrape_url',
      url: 'https://detail.1688.com/offer/123.html',
    }));

    expect(runtime.scrapeResults.persist).toHaveBeenCalledWith({
      organizationId: 'org-1',
      triggeredByUserId: 'user-1',
      output: expect.objectContaining({ ok: true }),
    });
    expect(result.output).toMatchObject({
      candidateId: 'candidate-1',
      href: '/product-pipeline/collected-products/candidate-1',
    });
  });

  it('fails the runtime when canonical candidate persistence fails', async () => {
    const runtime = handler({
      playwright: { execute: vi.fn().mockResolvedValue({
        output: { ok: true, scraped_data: { title: '실리콘 식판' } },
      }) },
      scrapeResults: { persist: vi.fn().mockRejectedValue(
        Object.assign(new Error('Scraped sourcing result requires a title.'), {
          code: 'sourcing_scrape_missing_title',
        }),
      ) },
    });

    await expect(runtime.value.execute(context({ action: 'scrape_url' })))
      .rejects.toMatchObject({ code: 'sourcing_scrape_missing_title' });
  });

  it('registers the deterministic sourcing and listing handlers', () => {
    const runtime = handler();
    runtime.value.onModuleInit();
    expect(runtime.registry.register).toHaveBeenCalledWith('sourcing', runtime.value);
    expect(runtime.registry.register).toHaveBeenCalledWith('listing', runtime.value);
  });

  it('supports only scrape_url for Sourcing conversations', () => {
    const runtime = handler().value;
    expect(runtime.supports(context({ action: 'scrape_url' }))).toBe(true);
    expect(runtime.supports(context({ action: 'market_research' }))).toBe(false);
    expect(runtime.supports({
      ...context({ productName: 'RC카' }),
      agentType: 'listing',
    })).toBe(true);
  });

  it('keeps deterministic listing package creation on the owner handler', async () => {
    const runtime = handler({
      toolRouter: { invoke: vi.fn().mockResolvedValue({
        status: 'succeeded',
        invocation: { id: 'tool-listing-1' },
        artifacts: [{ id: 'artifact-listing-1' }],
      }) },
    });
    const result = await runtime.value.execute({
      ...context({ productName: '무선 RC카', imageUrls: ['https://cdn.test/car.jpg'] }),
      agentType: 'listing',
      agentInstanceId: 'agent-listing-1',
    });
    expect(runtime.toolRouter.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'listing',
        capabilityKey: 'product_listing.create_generation_package',
      }),
    );
    expect(result.output).toMatchObject({ status: 'listing_prep_started' });
  });
});
