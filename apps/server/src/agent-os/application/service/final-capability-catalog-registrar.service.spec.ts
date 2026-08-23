import { describe, expect, it, vi } from 'vitest';
import { AgentResultEnvelopeSchema } from '@kiditem/shared/agent-interaction';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import {
  FINAL_CAPABILITY_DEFINITIONS,
  registerFinalCapabilityCatalog,
  type FinalCapabilityBinding,
} from './final-capability-catalog-registrar.service';

const expectedKeys = [
  'agent_os.platform_probe',
  'analytics.readOverview',
  'channels.register_confirmed_listing',
  'channels.submit_coupang_listing',
  'channels.submit_wing_thumbnail',
  'products.create_listing_generation_package',
  'sourcing.collect_shadow_signals',
  'sourcing.createReviewBatch',
  'sourcing.duplicateCheck',
  'sourcing.ingestCandidate',
  'sourcing.inspectRecommendationRun',
  'sourcing.refreshCollection',
  'sourcing.refreshValidation',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.scrapeProductUrl',
  'sourcing.scrapeUrlWorkflow',
  'supply.create_purchase_order_draft',
  'supply.submit_purchase_order',
] as const;

const expectedOwnerInputPorts = {
  'agent_os.platform_probe': 'agent_os.platformProbe',
  'analytics.readOverview': 'analytics.readOverview',
  'channels.register_confirmed_listing': 'channels.registerConfirmedListing',
  'channels.submit_coupang_listing': 'channels.submitCoupangListing',
  'channels.submit_wing_thumbnail': 'channels.submitWingThumbnail',
  'products.create_listing_generation_package': 'products.createListingGenerationPackage',
  'sourcing.collect_shadow_signals': 'sourcing.collectShadowSignals',
  'sourcing.createReviewBatch': 'sourcing.createReviewBatch',
  'sourcing.duplicateCheck': 'sourcing.duplicateCheck',
  'sourcing.ingestCandidate': 'sourcing.ingestCandidate',
  'sourcing.inspectRecommendationRun': 'sourcing.inspectRecommendationRun',
  'sourcing.refreshCollection': 'sourcing.refreshCollection',
  'sourcing.refreshValidation': 'sourcing.refreshValidation',
  'sourcing.retrieveWorkspaceEvidence': 'sourcing.retrieveWorkspaceEvidence',
  'sourcing.scrapeProductUrl': 'sourcing.scrapeProductUrl',
  'sourcing.scrapeUrlWorkflow': 'sourcing.scrapeUrlWorkflow',
  'supply.create_purchase_order_draft': 'supply.createPurchaseOrderDraft',
  'supply.submit_purchase_order': 'supply.submitPurchaseOrder',
} as const satisfies Record<(typeof expectedKeys)[number], string>;

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001',
  initiatingUserId: '00000000-0000-4000-8000-000000000002',
  sessionId: '00000000-0000-4000-8000-000000000003',
  taskId: '00000000-0000-4000-8000-000000000004',
  attemptId: '00000000-0000-4000-8000-000000000005',
  agentVersionId: '00000000-0000-4000-8000-000000000006',
  ownerIdempotencyKey: 'owner-idempotency-key',
  applicationVersion: '0.25.0',
  authorizingGitSha: 'a'.repeat(40),
  runtimeType: 'codex_cli',
};

const frozenSubmissionInput = {
  executionId: '00000000-0000-4000-8000-000000000011',
  preparationId: '00000000-0000-4000-8000-000000000012',
  sourceCandidateId: '00000000-0000-4000-8000-000000000013',
  channelAccountId: '00000000-0000-4000-8000-000000000014',
  submissionKey: 'submission-key',
  submissionPayloadHash: 'b'.repeat(64),
  submissionPayloadJson: { sellerProductName: 'Toy' },
  providerSubmissionId: null,
  registrationResult: null,
  isRetry: false,
  providerOutcome: 'not_attempted' as const,
  providerCreateAllowed: true,
  optionLinks: [],
};

const sourceSnapshot = {
  sourceUrl: 'https://detail.1688.com/offer/1.html',
  platform: '1688' as const,
  title: 'Toy',
  price: 1,
  currency: 'CNY',
  images: [],
  contentHash: 'a'.repeat(64),
};

const validInputByKey = {
  'agent_os.platform_probe': {},
  'analytics.readOverview': {},
  'channels.register_confirmed_listing': {
    ...frozenSubmissionInput,
    externalListingId: 'external-listing-1',
    displayName: 'Toy',
    confirmationEvidence: {
      wingVendorId: 'vendor-1',
      wingIdentitySource: 'dom:data-vendor-id' as const,
    },
  },
  'channels.submit_coupang_listing': frozenSubmissionInput,
  'channels.submit_wing_thumbnail': { generationId: 'generation-1' },
  'products.create_listing_generation_package': {
    candidateId: '00000000-0000-4000-8000-000000000038',
  },
  'sourcing.collect_shadow_signals': {},
  'sourcing.createReviewBatch': {
    recommendationRunId: '00000000-0000-4000-8000-000000000007',
    workspaceKey: 'entry' as const,
    items: [{ itemKey: 'item-1', expectedVersion: 0 }],
  },
  'sourcing.duplicateCheck': { sourceUrl: sourceSnapshot.sourceUrl },
  'sourcing.ingestCandidate': { snapshot: sourceSnapshot },
  'sourcing.inspectRecommendationRun': {},
  'sourcing.refreshCollection': { sources: ['naver' as const] },
  'sourcing.refreshValidation': {
    recommendationRunId: '00000000-0000-4000-8000-000000000007',
  },
  'sourcing.retrieveWorkspaceEvidence': { query: 'toy' },
  'sourcing.scrapeProductUrl': { sourceUrl: sourceSnapshot.sourceUrl },
  'sourcing.scrapeUrlWorkflow': { sourceUrl: sourceSnapshot.sourceUrl },
  'supply.create_purchase_order_draft': {
    sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000008',
    productName: 'Toy',
    supplierName: 'Supplier',
    unitPriceCny: 1,
    moq: 1,
  },
  'supply.submit_purchase_order': {
    purchaseOrderId: '00000000-0000-4000-8000-000000000009',
  },
} as const satisfies Record<(typeof expectedKeys)[number], Record<string, unknown>>;

function owners() {
  return {
    sourcing: {
      duplicateCheck: vi.fn().mockResolvedValue({ duplicate: false, candidateId: null }),
      scrapeProductUrl: vi.fn().mockResolvedValue({ snapshot: { sourceUrl: 'https://detail.1688.com/offer/1.html', platform: '1688', title: 'Toy', price: 1, currency: 'CNY', images: [], contentHash: 'a'.repeat(64) } }),
      ingestCandidate: vi.fn().mockResolvedValue({ candidateId: '00000000-0000-4000-8000-000000000039' }),
      scrapeUrlWorkflow: vi.fn().mockResolvedValue({ kind: 'enqueued', operationRunId: '00000000-0000-4000-8000-000000000035', status: 'queued' }),
      retrieveWorkspaceEvidence: vi.fn().mockResolvedValue({ inputHash: 'a'.repeat(64), documentCount: 0, documents: [], dataGaps: [] }),
      inspectRecommendationRun: vi.fn().mockResolvedValue({ runId: 'run-1', status: 'complete', businessDate: '2026-08-23', itemCount: 1, warningCodes: [], validation: { itemCount: 1, missingCount: 0 } }),
      refreshCollection: vi.fn().mockResolvedValue({ operationRunId: '00000000-0000-4000-8000-000000000036', status: 'queued' }),
      refreshValidation: vi.fn().mockResolvedValue({ recommendationRunId: '00000000-0000-4000-8000-000000000007', validationEpisodeIds: [], missingEvidence: [] }),
      createReviewBatch: vi.fn().mockResolvedValue({ reviewBatchId: 'batch-1', itemCount: 1, status: 'pending_review' }),
      collectShadowSignals: vi.fn().mockResolvedValue({ operationRunId: '00000000-0000-4000-8000-000000000037', status: 'queued' }),
    },
    channels: {
      submitWingThumbnail: vi.fn().mockResolvedValue({ success: true, screenshotPath: null }),
      registerConfirmedListing: vi.fn().mockResolvedValue({ preparationId: '00000000-0000-4000-8000-000000000031', listingId: '00000000-0000-4000-8000-000000000032', status: 'registered' }),
      submitCoupangListing: vi.fn().mockResolvedValue({ preparationId: '00000000-0000-4000-8000-000000000033', listingId: '00000000-0000-4000-8000-000000000034', status: 'registered' }),
    },
    products: {
      createListingGenerationPackage: vi.fn().mockResolvedValue({ candidateId: '00000000-0000-4000-8000-000000000033', operationRunId: '00000000-0000-4000-8000-000000000034', status: 'queued' }),
    },
    analytics: {
      readOverview: vi.fn().mockResolvedValue({ sales: { revenue: 1, orders: 2 }, inventory: { outOfStockSkus: 3, mappingAttentionSkus: 4 }, freshness: { lastSync: '2026-08-23T00:00:00.000Z', confirmedUntil: null } }),
    },
    supply: {
      createPurchaseOrderDraft: vi.fn().mockResolvedValue({ orderId: 'order-1', status: 'draft' }),
      submitPurchaseOrder: vi.fn().mockResolvedValue({ orderId: 'order-1', status: 'ordered' }),
    },
    platform: { platformProbe: vi.fn().mockResolvedValue({ status: 'available' }) },
  };
}

function finalBindings(ports = owners()): { ports: typeof ports; bindings: FinalCapabilityBinding[] } {
  return {
    ports,
    bindings: [
      { capabilityKey: 'agent_os.platform_probe', invoke: (input) => ports.platform.platformProbe(input) },
      { capabilityKey: 'analytics.readOverview', invoke: (input) => ports.analytics.readOverview(input) },
      { capabilityKey: 'channels.register_confirmed_listing', invoke: (input) => ports.channels.registerConfirmedListing(input) },
      { capabilityKey: 'channels.submit_coupang_listing', invoke: (input) => ports.channels.submitCoupangListing(input) },
      { capabilityKey: 'channels.submit_wing_thumbnail', invoke: (input) => ports.channels.submitWingThumbnail(input) },
      { capabilityKey: 'products.create_listing_generation_package', invoke: (input) => ports.products.createListingGenerationPackage(input) },
      { capabilityKey: 'sourcing.collect_shadow_signals', invoke: (input) => ports.sourcing.collectShadowSignals(input) },
      { capabilityKey: 'sourcing.createReviewBatch', invoke: (input) => ports.sourcing.createReviewBatch(input) },
      { capabilityKey: 'sourcing.duplicateCheck', invoke: (input) => ports.sourcing.duplicateCheck(input) },
      { capabilityKey: 'sourcing.ingestCandidate', invoke: (input) => ports.sourcing.ingestCandidate(input) },
      { capabilityKey: 'sourcing.inspectRecommendationRun', invoke: (input) => ports.sourcing.inspectRecommendationRun(input) },
      { capabilityKey: 'sourcing.refreshCollection', invoke: (input) => ports.sourcing.refreshCollection(input) },
      { capabilityKey: 'sourcing.refreshValidation', invoke: (input) => ports.sourcing.refreshValidation(input) },
      { capabilityKey: 'sourcing.retrieveWorkspaceEvidence', invoke: (input) => ports.sourcing.retrieveWorkspaceEvidence(input) },
      { capabilityKey: 'sourcing.scrapeProductUrl', invoke: (input) => ports.sourcing.scrapeProductUrl(input) },
      { capabilityKey: 'sourcing.scrapeUrlWorkflow', invoke: (input) => ports.sourcing.scrapeUrlWorkflow(input) },
      { capabilityKey: 'supply.create_purchase_order_draft', invoke: (input) => ports.supply.createPurchaseOrderDraft(input) },
      { capabilityKey: 'supply.submit_purchase_order', invoke: (input) => ports.supply.submitPurchaseOrder(input) },
    ],
  };
}

describe('FinalCapabilityCatalogRegistrar', () => {
  it('defines exactly the sorted 18-key KID-25 owner capability catalog with strict business schemas', () => {
    expect(FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key)).toEqual(expectedKeys);
    expect(Object.fromEntries(FINAL_CAPABILITY_DEFINITIONS.map((definition) => [
      definition.key,
      definition.ownerInputPort,
    ]))).toEqual(expectedOwnerInputPorts);
    for (const definition of FINAL_CAPABILITY_DEFINITIONS) {
      const validInput = validInputByKey[definition.key as keyof typeof validInputByKey];
      expect(definition.inputSchema.safeParse(validInput).success).toBe(true);
      for (const authorityField of [
        'organizationId',
        'userId',
        'sessionId',
        'taskId',
        'attemptId',
        'agentVersionId',
      ]) {
        expect(definition.inputSchema.safeParse({
          ...validInput,
          [authorityField]: context.organizationId,
        }).success).toBe(false);
      }
      expect(definition.outputSchema.safeParse({}).success).toBe(false);
    }
  });

  it('keeps all ten Sourcing capabilities Agent-facing', () => {
    const keys = FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key);
    expect(keys).toEqual(expect.arrayContaining([
      'sourcing.duplicateCheck',
      'sourcing.scrapeProductUrl',
      'sourcing.ingestCandidate',
      'sourcing.collect_shadow_signals',
    ]));
  });

  it('registers exactly one owner implementation for every definition', () => {
    const registry = new AgentCapabilityRegistry();
    registerFinalCapabilityCatalog(registry, finalBindings().bindings);

    expect(() => registry.assertFinalCatalog()).not.toThrow();
    expect(FINAL_CAPABILITY_DEFINITIONS.map((definition) => registry.resolveImplementation(definition.key)?.capabilityKey))
      .toEqual(expectedKeys);
  });

  it('invokes every definition through its one registered implementation', async () => {
    const registry = new AgentCapabilityRegistry();
    registerFinalCapabilityCatalog(registry, finalBindings().bindings);

    for (const capabilityKey of expectedKeys) {
      const result = await registry.resolveImplementation(capabilityKey)!.invoke({
        context,
        input: validInputByKey[capabilityKey],
      });
      expect(AgentResultEnvelopeSchema.safeParse(result).success).toBe(true);
    }
  });

  it('rejects the retired master-only Channels shape and accepts frozen provenance-complete submission input', () => {
    const definition = FINAL_CAPABILITY_DEFINITIONS.find((item) => item.key === 'channels.submit_coupang_listing')!;
    expect(definition.inputSchema.safeParse({ masterId: 'master-1', channelAccountId: 'account-1', listingPayload: {} }).success).toBe(false);
    expect(definition.inputSchema.safeParse({
      executionId: '00000000-0000-4000-8000-000000000011', preparationId: '00000000-0000-4000-8000-000000000012', sourceCandidateId: '00000000-0000-4000-8000-000000000013', channelAccountId: '00000000-0000-4000-8000-000000000014', submissionKey: 'submission-key', submissionPayloadHash: 'b'.repeat(64), submissionPayloadJson: { sellerProductName: 'Toy' }, providerSubmissionId: null, registrationResult: null, isRetry: false, providerOutcome: 'not_attempted', providerCreateAllowed: true, optionLinks: [],
    }).success).toBe(true);
  });

  it('requires an existing candidate for Products generation instead of creating Sourcing data', () => {
    const definition = FINAL_CAPABILITY_DEFINITIONS.find((item) => item.key === 'products.create_listing_generation_package')!;
    expect(definition.inputSchema.safeParse({ productName: 'Toy', imageUrls: ['https://example.test/toy.jpg'] }).success).toBe(false);
    expect(definition.inputSchema.safeParse({
      candidateId: '00000000-0000-4000-8000-000000000038',
      templateId: 'bold-vertical',
      task: 'all',
    }).success).toBe(true);
  });

  it.each([
    ['sourcing.retrieveWorkspaceEvidence', { query: 'slime' }, 'sourcing', 'retrieveWorkspaceEvidence'],
    ['sourcing.refreshCollection', { sources: ['naver'] }, 'sourcing', 'refreshCollection'],
    ['sourcing.refreshValidation', { recommendationRunId: '00000000-0000-4000-8000-000000000007' }, 'sourcing', 'refreshValidation'],
    ['channels.submit_wing_thumbnail', { generationId: 'generation-1' }, 'channels', 'submitWingThumbnail'],
    ['channels.submit_coupang_listing', { executionId: '00000000-0000-4000-8000-000000000021', preparationId: '00000000-0000-4000-8000-000000000022', sourceCandidateId: '00000000-0000-4000-8000-000000000023', channelAccountId: '00000000-0000-4000-8000-000000000024', submissionKey: 'submission-key', submissionPayloadHash: 'c'.repeat(64), submissionPayloadJson: { sellerProductName: 'Toy' }, providerSubmissionId: null, registrationResult: null, isRetry: false, providerOutcome: 'not_attempted', providerCreateAllowed: true, optionLinks: [] }, 'channels', 'submitCoupangListing'],
    ['supply.create_purchase_order_draft', {
      sellpiaInventorySkuId: '00000000-0000-4000-8000-000000000008', productName: 'Toy', supplierName: 'Supplier', unitPriceCny: 1, moq: 1,
    }, 'supply', 'createPurchaseOrderDraft'],
  ] as const)('%s parses business input separately and delivers only server context', async (capabilityKey, input, owner, method) => {
    const registry = new AgentCapabilityRegistry();
    const { ports, bindings } = finalBindings();
    registerFinalCapabilityCatalog(registry, bindings);

    const result = await registry.resolveImplementation(capabilityKey)!.invoke({ context, input });

    expect(AgentResultEnvelopeSchema.parse(result)).toMatchObject({
      outcome: 'completed',
      summary: expect.any(String),
      resourceRefs: expect.any(Array),
      operationRefs: expect.any(Array),
      output: expect.anything(),
    });
    const ownerPort = ports[owner] as Record<string, ReturnType<typeof vi.fn>>;
    expect(ownerPort[method]).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: context.organizationId,
      initiatingUserId: context.initiatingUserId,
      ownerIdempotencyKey: context.ownerIdempotencyKey,
    }));
    expect(ownerPort[method]).not.toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ organizationId: context.organizationId }),
    }));
  });
});
