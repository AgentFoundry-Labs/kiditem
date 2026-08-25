import { describe, expect, it, vi } from 'vitest';
import { AgentOsCapabilityCompositionAdapter } from '../../adapter/in/agent/agent-os-capability-composition.adapter';
import { AnalyticsCapabilityCompositionAdapter } from '../../../analytics/adapter/in/agent/analytics-capability-composition.adapter';
import { ChannelsCapabilityCompositionAdapter } from '../../../channels/adapter/in/agent/channels-capability-composition.adapter';
import { ProductsCapabilityCompositionAdapter } from '../../../products/adapter/in/agent/products-capability-composition.adapter';
import { SourcingCapabilityCompositionAdapter } from '../../../sourcing/adapter/in/agent/sourcing-capability-composition.adapter';
import { SupplyCapabilityCompositionAdapter } from '../../../supply/adapter/in/agent/supply-capability-composition.adapter';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import {
  FINAL_CAPABILITY_DEFINITIONS,
  registerFinalCapabilityCatalog,
} from './final-capability-catalog-registrar.service';
import type { AgentOsPlatformProbeCapabilityPort } from '../port/in/capability/platform-probe.port';
import type { AnalyticsAgentOverviewCapabilityPort } from '../../../analytics/dashboard/application/port/in/analytics-overview-capability.port';
import type {
  ChannelsFinalCapabilityPort,
  ChannelsRegistrationReference,
} from '../../../channels/application/port/in/capability/channels-final-capability.port';
import type { ChannelsWingThumbnailCapabilityPort } from '../../../channels/application/port/in/capability/wing-thumbnail.port';
import type { ProductsListingGenerationCapabilityPort } from '../../../products/application/port/in/capability/listing-generation.port';
import type {
  SourcingFinalCapabilityPort,
  SourcingSourceSnapshot,
} from '../../../sourcing/application/port/in/capability/sourcing-final-capability.port';
import type { SupplyPurchaseOrderCapabilityPort } from '../../../supply/application/port/in/capability/purchase-order.port';

const identifiers = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  sessionId: '00000000-0000-4000-8000-000000000003',
  taskId: '00000000-0000-4000-8000-000000000004',
  attemptId: '00000000-0000-4000-8000-000000000005',
  agentVersionId: '00000000-0000-4000-8000-000000000006',
  executionId: '00000000-0000-4000-8000-000000000007',
  preparationId: '00000000-0000-4000-8000-000000000008',
  candidateId: '00000000-0000-4000-8000-000000000009',
  recommendationRunId: '00000000-0000-4000-8000-000000000010',
  purchaseOrderId: '00000000-0000-4000-8000-000000000011',
  operationRunId: '00000000-0000-4000-8000-000000000012',
};

const context = {
  organizationId: identifiers.organizationId,
  initiatingUserId: identifiers.userId,
  sessionId: identifiers.sessionId,
  taskId: identifiers.taskId,
  attemptId: identifiers.attemptId,
  agentVersionId: identifiers.agentVersionId,
  ownerIdempotencyKey: 'owner-idempotency-key',
  applicationVersion: '0.25.0',
  authorizingGitSha: 'a'.repeat(40),
  runtimeType: 'codex_cli',
};

const registrationReference: ChannelsRegistrationReference = {
  executionId: identifiers.executionId,
  preparationId: identifiers.preparationId,
};

const snapshot: SourcingSourceSnapshot = {
  sourceUrl: 'https://detail.1688.com/offer/1.html',
  platform: '1688',
  title: 'Toy',
  price: 1,
  currency: 'CNY',
  variantKeyNormalized: 'default',
  images: [],
  contentHash: 'a'.repeat(64),
};

function ownerCompositions() {
  const platform: AgentOsPlatformProbeCapabilityPort = {
    platformProbe: vi.fn(async () => ({ status: 'available' as const })),
  };
  const analytics: AnalyticsAgentOverviewCapabilityPort = {
    readOverview: vi.fn(async () => ({
      sales: { revenue: 1, orders: 2 },
      inventory: { outOfStockSkus: 3, mappingAttentionSkus: 4 },
      freshness: { lastSync: '2026-08-25T00:00:00.000Z', confirmedUntil: null },
    })),
  };
  const channels: ChannelsFinalCapabilityPort = {
    registerConfirmedListing: vi.fn(async () => ({
      preparationId: identifiers.preparationId,
      listingId: identifiers.candidateId,
      status: 'registered' as const,
    })),
    submitCoupangListing: vi.fn(async () => ({
      preparationId: identifiers.preparationId,
      listingId: identifiers.candidateId,
      status: 'registered' as const,
    })),
  };
  const wing: ChannelsWingThumbnailCapabilityPort = {
    submitWingThumbnail: vi.fn(async () => ({ success: true, screenshotPath: null })),
  };
  const products: ProductsListingGenerationCapabilityPort = {
    createListingGenerationPackage: vi.fn(async () => ({
      candidateId: identifiers.candidateId,
      operationRunId: identifiers.operationRunId,
      status: 'queued',
    })),
  };
  const sourcing: SourcingFinalCapabilityPort = {
    duplicateCheck: vi.fn(async () => ({ duplicate: false, candidateId: null })),
    scrapeProductUrl: vi.fn(async () => ({ snapshot })),
    ingestCandidate: vi.fn(async () => ({ candidateId: identifiers.candidateId })),
    createReviewBatch: vi.fn(async () => ({
      reviewBatchId: 'review-batch-1',
      itemCount: 1,
      status: 'pending_review',
    })),
    inspectRecommendationRun: vi.fn(async () => ({
      runId: identifiers.recommendationRunId,
      status: 'complete' as const,
      businessDate: '2026-08-25',
      itemCount: 1,
      warningCodes: [],
      validation: { itemCount: 1, missingCount: 0 },
    })),
    refreshCollection: vi.fn(async () => ({
      operationRunId: identifiers.operationRunId,
      status: 'queued',
    })),
    refreshValidation: vi.fn(async () => ({
      recommendationRunId: identifiers.recommendationRunId,
      validationEpisodeIds: [],
      missingEvidence: [],
    })),
    retrieveWorkspaceEvidence: vi.fn(async () => ({
      inputHash: 'b'.repeat(64),
      documentCount: 0,
      documents: [],
      dataGaps: [],
    })),
    scrapeUrlWorkflow: vi.fn(async () => ({
      kind: 'enqueued' as const,
      operationRunId: identifiers.operationRunId,
      status: 'queued',
    })),
    collectShadowSignals: vi.fn(async () => ({
      operationRunId: identifiers.operationRunId,
      status: 'queued',
    })),
  };
  const supply: SupplyPurchaseOrderCapabilityPort = {
    createPurchaseOrderDraft: vi.fn(async () => ({
      orderId: identifiers.purchaseOrderId,
      status: 'draft',
    })),
    submitPurchaseOrder: vi.fn(async () => ({
      orderId: identifiers.purchaseOrderId,
      status: 'ordered',
    })),
  };

  return {
    ports: { platform, analytics, channels, wing, products, sourcing, supply },
    providers: [
      new AgentOsCapabilityCompositionAdapter(platform),
      new AnalyticsCapabilityCompositionAdapter(analytics),
      new ChannelsCapabilityCompositionAdapter(channels, wing),
      new ProductsCapabilityCompositionAdapter(products),
      new SourcingCapabilityCompositionAdapter(sourcing),
      new SupplyCapabilityCompositionAdapter(supply),
    ],
  };
}

describe('owner capability composition', () => {
  it('registers the exact 18 owner-local units and invokes their actual typed owner ports', async () => {
    const { ports, providers } = ownerCompositions();
    const registry = new AgentCapabilityRegistry();

    expect(providers.map((provider) => provider.compositions)).toHaveLength(6);
    expect(
      providers.flatMap((provider) => provider.compositions),
    ).toHaveLength(18);

    registerFinalCapabilityCatalog(registry, providers);
    expect(registry.listDefinitions().map((definition) => definition.key)).toEqual(
      FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key),
    );

    await registry.resolveImplementation('agent_os.platform_probe')!.invoke({
      context,
      input: {},
    });
    await registry.resolveImplementation('analytics.readOverview')!.invoke({
      context,
      input: { period: 'today' },
    });
    await registry
      .resolveImplementation('channels.submit_coupang_listing')!
      .invoke({ context, input: registrationReference });
    await registry.resolveImplementation('channels.submit_wing_thumbnail')!.invoke({
      context,
      input: { generationId: 'generation-1' },
    });
    await registry
      .resolveImplementation('products.create_listing_generation_package')!
      .invoke({ context, input: { candidateId: identifiers.candidateId } });
    await registry.resolveImplementation('sourcing.ingestCandidate')!.invoke({
      context,
      input: { snapshot },
    });
    await registry
      .resolveImplementation('supply.create_purchase_order_draft')!
      .invoke({
        context,
        input: {
          sellpiaInventorySkuId: identifiers.candidateId,
          productName: 'Toy',
          supplierName: 'Supplier',
          unitPriceCny: 1,
          moq: 1,
        },
      });

    expect(ports.platform.platformProbe).toHaveBeenCalledOnce();
    expect(ports.analytics.readOverview).toHaveBeenCalledWith({
      organizationId: identifiers.organizationId,
      period: 'today',
    });
    expect(ports.channels.submitCoupangListing).toHaveBeenCalledWith({
      context: expect.objectContaining({
        organizationId: identifiers.organizationId,
        initiatingUserId: identifiers.userId,
        ownerIdempotencyKey: context.ownerIdempotencyKey,
      }),
      input: registrationReference,
    });
    expect(ports.wing.submitWingThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: identifiers.organizationId,
        triggeredByUserId: identifiers.userId,
        ownerIdempotencyKey: context.ownerIdempotencyKey,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(ports.products.createListingGenerationPackage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: identifiers.organizationId,
        triggeredByUserId: identifiers.userId,
        idempotencyKey: context.ownerIdempotencyKey,
        candidateId: identifiers.candidateId,
      }),
    );
    expect(ports.sourcing.ingestCandidate).toHaveBeenCalledWith({
      context: expect.objectContaining({
        organizationId: identifiers.organizationId,
        initiatingUserId: identifiers.userId,
        attemptId: identifiers.attemptId,
        ownerIdempotencyKey: context.ownerIdempotencyKey,
      }),
      input: { snapshot },
    });
    expect(ports.supply.createPurchaseOrderDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: identifiers.organizationId,
        userId: identifiers.userId,
        idempotencyKey: context.ownerIdempotencyKey,
      }),
    );
  });
});
