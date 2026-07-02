import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityHandler } from '../../../../../agent-os/application/port/out/capability/agent-capability-handler.port';
import type { AgentCapabilityRegistry } from '../../../../../agent-os/application/service/agent-capability-registry.service';
import { SourcingDiscoveryCapabilityAdapter } from '../sourcing-discovery-capability.adapter';

function discoveryResultWithSupplier(sourceUrl: string) {
  return {
    marketSignals: [],
    coupangMatches: [],
    trackingSnapshots: [],
    supplierMatches: [
      {
        supplierName: '1688 Kids Factory',
        productName: '실리콘 식판',
        sourceUrl,
        unitPriceCny: 22.8,
        moq: 2,
        confidence: 0.88,
      },
    ],
    scoredOpportunities: [],
    recommendations: [],
  };
}

function discoveryResultWithRecommendation() {
  return {
    marketSignals: [],
    coupangMatches: [],
    trackingSnapshots: [],
    supplierMatches: [],
    scoredOpportunities: [],
    recommendations: [
      {
        id: 'recommendation-1',
        productName: '실리콘 식판 흡착형 신제품',
        coupangEvidence: {},
        supplierEvidence: {},
        score: {
          totalScore: 84,
        },
        artifact: {
          title: '실리콘 식판 흡착형 신제품 테스트 발주 후보',
          summary: {
            productName: '실리콘 식판 흡착형 신제품',
            supplierName: '1688 Kids Factory',
            unitPriceCny: 22.8,
            moq: 2,
          },
        },
      },
    ],
  };
}

describe('SourcingDiscoveryCapabilityAdapter', () => {
  it('routes supplier 1688 matches with source URLs through the scrape URL workflow', async () => {
    const registered: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => {
        registered.push(handler);
      }),
    } as unknown as AgentCapabilityRegistry;
    const discovery = {
      discover: vi
        .fn()
        .mockResolvedValue(
          discoveryResultWithSupplier('https://detail.1688.com/offer/123.html'),
        ),
    };
    const scrapeWorkflow = {
      scrapeUrlWorkflow: vi.fn().mockResolvedValue({
        skipped: false,
        candidateId: null,
        href: null,
        operationKey: 'sourcing-scrape:request-1',
        taskId: 'request-1',
      }),
    };
    const AdapterCtor = SourcingDiscoveryCapabilityAdapter as unknown as new (
      ...args: unknown[]
    ) => SourcingDiscoveryCapabilityAdapter;

    const adapter = new AdapterCtor(registry, discovery, scrapeWorkflow);
    adapter.onModuleInit();

    const supplierHandler = registered.find(
      (handler) => handler.key === 'supplier1688.match_products',
    );
    expect(supplierHandler).toBeDefined();
    expect(supplierHandler).toMatchObject({
      executionKind: 'workflow',
      sideEffects: ['read', 'browser', 'external_io', 'db_write', 'job_enqueue'],
      approvalRisk: 'low',
    });
    expect(
      supplierHandler!.idempotencyKey({
        organizationId: 'org-1',
        conversationId: 'conversation-1',
        agentInstanceId: 'agent-sourcing-1',
        agentType: 'sourcing',
        requestId: 'request-parent-1',
        runId: 'run-parent-1',
        input: {
          keyword: '실리콘 식판',
          supplierUrl: 'https://detail.1688.com/offer/123.html',
        },
      }),
    ).toBe('org-1:supplier1688.match_products:request:request-parent-1');
    const result = await supplierHandler!.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-sourcing-1',
      agentType: 'sourcing',
      requestId: 'request-parent-1',
      runId: 'run-parent-1',
      capabilityKey: 'supplier1688.match_products',
      requestedByUserId: 'user-1',
      input: {
        keyword: '실리콘 식판',
        supplierUrl: 'https://detail.1688.com/offer/123.html',
      },
    });

    expect(scrapeWorkflow.scrapeUrlWorkflow).toHaveBeenCalledWith({
      organizationId: 'org-1',
      sourceUrl: 'https://detail.1688.com/offer/123.html',
      triggeredByUserId: 'user-1',
      conversationId: 'conversation-1',
      parentRequestId: 'request-parent-1',
      delegatedByRunId: 'run-parent-1',
    });
    expect(result.outputSummary).toEqual({
      count: 1,
      scrapeWorkflowRequests: 1,
    });
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        artifactType: 'supplier_match',
        targetModel: 'SupplierMatch',
        title: '1688 공급처 매칭',
        summary: expect.objectContaining({
          sourceUrl: 'https://detail.1688.com/offer/123.html',
          operationKey: 'sourcing-scrape:request-1',
          taskId: 'request-1',
        }),
      }),
    ]);
  });

  it('adds an order-draft handoff intent to recommendation artifacts', async () => {
    const registered: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => {
        registered.push(handler);
      }),
    } as unknown as AgentCapabilityRegistry;
    const discovery = {
      discover: vi.fn().mockResolvedValue(discoveryResultWithRecommendation()),
    };
    const AdapterCtor = SourcingDiscoveryCapabilityAdapter as unknown as new (
      ...args: unknown[]
    ) => SourcingDiscoveryCapabilityAdapter;

    const adapter = new AdapterCtor(registry, discovery);
    adapter.onModuleInit();

    const recommendationHandler = registered.find(
      (handler) => handler.key === 'sourcing.create_recommendation_packet',
    );
    expect(recommendationHandler).toBeDefined();
    expect(
      recommendationHandler!.idempotencyKey?.({
        organizationId: 'org-1',
        requestId: 'request-parent-1',
        input: {
          keyword: '실리콘 식판',
        },
      }),
    ).toBe(
      'org-1:sourcing.create_recommendation_packet:handoff_v1:request:request-parent-1',
    );
    const result = await recommendationHandler!.execute({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      agentInstanceId: 'agent-sourcing-1',
      agentType: 'sourcing',
      requestId: 'request-parent-1',
      runId: 'run-parent-1',
      capabilityKey: 'sourcing.create_recommendation_packet',
      requestedByUserId: 'user-1',
      input: {
        keyword: '실리콘 식판',
      },
    });

    expect(result.artifacts?.[0]).toEqual(
      expect.objectContaining({
        artifactType: 'sourcing_recommendation',
        summary: expect.objectContaining({
          productName: '실리콘 식판 흡착형 신제품',
          handoffIntent: expect.objectContaining({
            targetAgentType: 'order',
            playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
            planStepKey: 'order_draft',
            trigger: 'user_selection',
            requiresUserSelection: true,
          }),
        }),
      }),
    );
  });

  it('adds handoff intent when executing the discovery capability port directly', async () => {
    const registered: AgentCapabilityHandler[] = [];
    const registry = {
      register: vi.fn((handler: AgentCapabilityHandler) => {
        registered.push(handler);
      }),
    } as unknown as AgentCapabilityRegistry;
    const discovery = {
      discover: vi.fn().mockResolvedValue(discoveryResultWithRecommendation()),
    };
    const AdapterCtor = SourcingDiscoveryCapabilityAdapter as unknown as new (
      ...args: unknown[]
    ) => SourcingDiscoveryCapabilityAdapter;

    const adapter = new AdapterCtor(registry, discovery, undefined);

    const result = await adapter.executeDiscoveryCapability({
      organizationId: 'org-1',
      keyword: '실리콘 식판',
      category: null,
      mode: 'stub',
    });

    expect(result.artifacts[0]).toMatchObject({
      artifactType: 'sourcing_recommendation',
      summary: expect.objectContaining({
        productName: '실리콘 식판 흡착형 신제품',
        handoffIntent: expect.objectContaining({
          targetAgentType: 'order',
          playbookKey: 'sourcing_market_opportunity_to_order_draft_v1',
          planStepKey: 'order_draft',
          trigger: 'user_selection',
          requiresUserSelection: true,
        }),
      }),
    });
  });
});
