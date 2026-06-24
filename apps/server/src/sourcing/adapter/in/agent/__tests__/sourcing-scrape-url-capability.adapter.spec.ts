import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';
import type { SourcingPlaywrightRuntimeHandler } from '../../../out/runtime/sourcing-playwright-runtime.handler';
import type { SourcingService } from '../../../../application/service/sourcing.service';
import { SourcingScrapeUrlCapabilityAdapter } from '../sourcing-scrape-url-capability.adapter';

describe('SourcingScrapeUrlCapabilityAdapter', () => {
  it('registers scrapeUrlWorkflow as a sourcing capability that executes the current Leaf scrape', async () => {
    const registry = {
      register: vi.fn(),
    } as unknown as AgentCapabilityRegistry;
    const workflow = {
      scrapeUrl: vi.fn(),
    } as unknown as SourcingService;
    const playwright = {
      execute: vi.fn().mockResolvedValue({
        provider: 'ts-playwright',
      output: {
        ok: true,
        scraped_data: {
          product_id: '123',
          source_url: 'https://detail.1688.com/offer/123.html',
          title: 'Off-road toy car',
          images: ['https://cdn.example.com/car.jpg'],
          },
          source_url: 'https://detail.1688.com/offer/123.html',
          platform: '1688',
        },
      }),
    } as unknown as SourcingPlaywrightRuntimeHandler;
    const adapter = new SourcingScrapeUrlCapabilityAdapter(
      registry,
      workflow,
      playwright,
    );
    adapter.onModuleInit();

    const handler = vi
      .mocked(registry.register)
      .mock.calls.map(([registered]) => registered)
      .find((registered) => registered.key === 'sourcing.scrapeProductUrl');
    expect(handler).toMatchObject({
      key: 'sourcing.scrapeProductUrl',
      ownerDomain: 'sourcing',
      executionKind: 'tool',
      sideEffects: ['browser', 'external_io'],
      approvalRisk: 'low',
    });

    const result = await handler.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-sourcing-1',
      agentType: 'sourcing',
      requestId: 'request-1',
      runId: 'run-1',
      requestedByUserId: 'user-1',
      input: {
        sourceUrl: 'https://detail.1688.com/offer/123.html',
      },
    });

    expect(workflow.scrapeUrl).not.toHaveBeenCalled();
    expect(playwright.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        agentInstanceId: 'agent-sourcing-1',
        agentType: 'sourcing',
        requestId: 'request-1',
        runId: 'run-1',
        input: {
          action: 'scrape_url',
          url: 'https://detail.1688.com/offer/123.html',
        },
      }),
    );
    expect(result).toMatchObject({
      resourceType: 'sourcing_scrape_url',
      resourceId: 'https://detail.1688.com/offer/123.html',
      outputSummary: {
        ok: true,
        source_url: 'https://detail.1688.com/offer/123.html',
        platform: '1688',
      },
      artifacts: [
        expect.objectContaining({
          artifactType: 'sourcing_scrape_snapshot',
          targetDomain: 'sourcing',
          targetModel: 'SourcingScrapeSnapshot',
          targetId: 'https://detail.1688.com/offer/123.html',
          title: '1688 scrape snapshot',
        }),
        expect.objectContaining({
          artifactType: 'sourcing_candidate',
          targetDomain: 'sourcing',
          targetModel: 'SourcingCandidateDraft',
          targetId: '123',
          title: 'Off-road toy car 소싱 후보',
          summary: expect.objectContaining({
            candidateSource: 'sourcing.scrapeProductUrl',
            scraped_data: expect.objectContaining({
              title: 'Off-road toy car',
            }),
          }),
        }),
      ],
    });
  });

  it('uses equivalent idempotency keys for sourceUrl and url aliases', () => {
    const registry = {
      register: vi.fn(),
    } as unknown as AgentCapabilityRegistry;
    const sourcing = {
      scrapeUrl: vi.fn(),
    } as unknown as SourcingService;
    const playwright = {
      execute: vi.fn(),
    } as unknown as SourcingPlaywrightRuntimeHandler;
    const adapter = new SourcingScrapeUrlCapabilityAdapter(
      registry,
      sourcing,
      playwright,
    );
    adapter.onModuleInit();

    const handler = vi
      .mocked(registry.register)
      .mock.calls.map(([registered]) => registered)
      .find((registered) => registered.key === 'sourcing.scrapeProductUrl');
    const bySourceUrl = handler.idempotencyKey({
      organizationId: 'org-1',
      input: { sourceUrl: 'https://detail.1688.com/offer/123.html' },
    });
    const byUrl = handler.idempotencyKey({
      organizationId: 'org-1',
      input: { url: ' https://detail.1688.com/offer/123.html ' },
    });

    expect(byUrl).toBe(bySourceUrl);
  });
});
