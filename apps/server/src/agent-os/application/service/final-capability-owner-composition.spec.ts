import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../common/owner-idempotency-key';
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
  executionId: '00000000-0000-4000-8000-000000000007',
  preparationId: '00000000-0000-4000-8000-000000000008',
  candidateId: '00000000-0000-4000-8000-000000000009',
  recommendationRunId: '00000000-0000-4000-8000-000000000010',
  purchaseOrderId: '00000000-0000-4000-8000-000000000011',
};

const context = {
  organizationId: identifiers.organizationId,
  initiatingUserId: identifiers.userId,
  executionId: identifiers.executionId,
  ownerIdempotencyKey: 'owner-idempotency-key',
};

function mutationContext(input: unknown) {
  return { ...context, ownerInputHash: canonicalOwnerInputHash(input) };
}

const registrationReference: ChannelsRegistrationReference = {
  registrationExecutionId: identifiers.executionId,
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
  const analytics: AnalyticsAgentOverviewCapabilityPort = {
    readOverview: vi.fn(async () => ({
      sales: { revenue: 1, orders: 2 },
      inventory: { outOfStockSkus: 3, mappingAttentionSkus: 4 },
      freshness: { lastSync: '2026-08-25T00:00:00.000Z' },
    })),
  };
  const channels: ChannelsFinalCapabilityPort = {
    registerConfirmedListing: vi.fn(async () => ({
      preparationId: identifiers.preparationId,
      listingId: identifiers.candidateId,
      status: 'registered' as const,
    })),
  };
  const wing: ChannelsWingThumbnailCapabilityPort = {
    submitWingThumbnail: vi.fn(async () => ({ success: true, screenshotPath: null })),
  };
  const executions = {
    prepareTargetExecution: vi.fn(),
    getTargetExecution: vi.fn(),
    startTargetExecution: vi.fn(),
    reportTargetExecution: vi.fn(),
  };
  const products: ProductsListingGenerationCapabilityPort = {
    createListingGenerationPackage: vi.fn(async () => ({
      candidateId: identifiers.candidateId,
      detailGenerationId: identifiers.candidateId,
      thumbnailGenerationId: identifiers.candidateId,
      contentWorkspaceId: identifiers.candidateId,
      href: `/product-pipeline/collected-products/${identifiers.candidateId}`,
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
    ports: { analytics, channels, wing, products, sourcing, supply },
    providers: [
      new AnalyticsCapabilityCompositionAdapter(analytics),
      new ChannelsCapabilityCompositionAdapter(channels, wing, executions as never),
      new ProductsCapabilityCompositionAdapter(products),
      new SourcingCapabilityCompositionAdapter(sourcing),
      new SupplyCapabilityCompositionAdapter(supply),
    ],
  };
}

describe('owner capability composition', () => {
  it('binds the seven direct Sourcing definitions to their matching keys', () => {
    const { providers } = ownerCompositions();
    const sourcing = providers.find(
      (provider) => provider instanceof SourcingCapabilityCompositionAdapter,
    );
    if (!sourcing) throw new Error('sourcing_capability_composition_missing');

    expect(sourcing.compositions.map(({ definition }) => definition.key)).toEqual([
      'sourcing.duplicateCheck',
      'sourcing.scrapeProductUrl',
      'sourcing.ingestCandidate',
      'sourcing.retrieveWorkspaceEvidence',
      'sourcing.inspectRecommendationRun',
      'sourcing.refreshValidation',
      'sourcing.createReviewBatch',
    ]);
    for (const { definition, implementation } of sourcing.compositions) {
      expect(implementation.capabilityKey).toBe(definition.key);
      expect(implementation.ownerInputPort).toBe(definition.ownerInputPort);
    }
  });

  it('registers the exact 17 owner-local units and invokes their actual typed owner ports', async () => {
    const { ports, providers } = ownerCompositions();
    const registry = new AgentCapabilityRegistry();

    expect(providers.map((provider) => provider.compositions)).toHaveLength(5);
    expect(
      providers.flatMap((provider) => provider.compositions),
    ).toHaveLength(17);

    registerFinalCapabilityCatalog(registry, providers);
    expect(registry.listDefinitions().map((definition) => definition.key)).toEqual(
      FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key),
    );

    await registry.resolveImplementation('analytics.readOverview')!.invoke({
      context,
      input: { period: 'today' },
    });
    await registry.resolveImplementation('channels.submit_wing_thumbnail')!.invoke({
      context: mutationContext({ generationId: 'generation-1' }),
      input: { generationId: 'generation-1' },
    });
    await registry
      .resolveImplementation('products.create_listing_generation_package')!
      .invoke({
        context: mutationContext({ candidateId: identifiers.candidateId }),
        input: { candidateId: identifiers.candidateId },
      });
    await registry.resolveImplementation('sourcing.ingestCandidate')!.invoke({
      context: mutationContext({ snapshot }),
      input: { snapshot },
    });
    await registry
      .resolveImplementation('supply.create_purchase_order_draft')!
      .invoke({
        context: mutationContext({
          masterProductId: identifiers.candidateId,
          productName: 'Toy',
          supplierName: 'Supplier',
          unitPriceCny: 1,
          moq: 1,
        }),
        input: {
          masterProductId: identifiers.candidateId,
          productName: 'Toy',
          supplierName: 'Supplier',
          unitPriceCny: 1,
          moq: 1,
        },
      });

    expect(ports.analytics.readOverview).toHaveBeenCalledWith({
      organizationId: identifiers.organizationId,
      period: 'today',
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
