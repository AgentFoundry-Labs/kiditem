import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import { canonicalOwnerInputHash } from '../../../../common/owner-idempotency-key';
import { MUTATION_EFFECTS, type CapabilityDefinition } from '../../../../common/capability-definition';
import { AnalyticsCapabilityCompositionAdapter } from '../../../../analytics/adapter/in/agent/analytics-capability-composition.adapter';
import { ChannelsCapabilityCompositionAdapter } from '../../../../channels/adapter/in/agent/channels-capability-composition.adapter';
import { ProductsCapabilityCompositionAdapter } from '../../../../products/adapter/in/agent/products-capability-composition.adapter';
import { SourcingCapabilityCompositionAdapter } from '../../../../sourcing/adapter/in/agent/sourcing-capability-composition.adapter';
import { SupplyCapabilityCompositionAdapter } from '../../../../supply/adapter/in/agent/supply-capability-composition.adapter';
import { AGENT_DEFINITIONS } from '../../../domain/agent-definition.registry';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../../domain/catalog/final-capability.catalog';
import { CapabilityApprovalService } from '../../../application/service/capability-approval.service';
import { AgentCapabilityRegistry } from '../../../application/service/agent-capability-registry.service';
import { CapabilityInvocationService } from '../../../application/service/capability-invocation.service';
import { CapabilityMutationDispatcher } from '../../../application/service/capability-mutation-dispatcher.service';
import { registerFinalCapabilityCatalog } from '../../../application/service/final-capability-catalog-registrar.service';
import {
  CAPABILITY_MCP_TOOL_NAMES,
  MCP_PROTOCOL_VERSION,
} from './capability-mcp-wire-contract';
import {
  createRequestScopedCapabilityMcpHandler,
  type CapabilityMcpDependencies,
} from './kiditem-agent-os-mcp-server';
import type { AnalyticsAgentOverviewCapabilityPort } from '../../../../analytics/dashboard/application/port/in/analytics-overview-capability.port';
import type { ChannelsFinalCapabilityPort } from '../../../../channels/application/port/in/capability/channels-final-capability.port';
import type { ChannelsWingThumbnailCapabilityPort } from '../../../../channels/application/port/in/capability/wing-thumbnail.port';
import type { ProductsListingGenerationCapabilityPort } from '../../../../products/application/port/in/capability/listing-generation.port';
import type {
  SourcingFinalCapabilityPort,
  SourcingSourceSnapshot,
} from '../../../../sourcing/application/port/in/capability/sourcing-final-capability.port';
import type { SupplyPurchaseOrderCapabilityPort } from '../../../../supply/application/port/in/capability/purchase-order.port';
import type {
  AdmitCapabilityInvocation,
  CapabilityInvocationRecord,
  DecideInvocationApproval,
  InvocationFence,
  RecordInvocationFailure,
  RecordInvocationSucceeded,
} from '../../../application/port/out/capability-invocation.repository.port';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000003';
const OPERATION_ID = '00000000-0000-4000-8000-000000000004';
const PREPARATION_ID = '00000000-0000-4000-8000-000000000005';
const RECOMMENDATION_RUN_ID = '00000000-0000-4000-8000-000000000006';
const PURCHASE_ORDER_ID = '00000000-0000-4000-8000-000000000007';
const CHANNEL_ACCOUNT_ID = '00000000-0000-4000-8000-000000000012';
const SALES_PRODUCT_OPTION_ID = '00000000-0000-4000-8000-000000000013';
const NOW = new Date('2026-08-28T00:00:00.000Z');
const SOURCE_URL = 'https://detail.1688.com/offer/712345678901.html';

const snapshot: SourcingSourceSnapshot = {
  sourceUrl: SOURCE_URL,
  platform: '1688',
  title: 'Toy',
  price: 1,
  currency: 'CNY',
  variantKeyNormalized: 'default',
  images: [],
  contentHash: 'a'.repeat(64),
};

const targetExecutionResult = {
  executionId: OPERATION_ID,
  targetId: PREPARATION_ID,
  channelAccountId: CHANNEL_ACCOUNT_ID,
  status: 'prepared' as const,
  providerOutcome: 'not_attempted' as const,
  payloadHash: 'c'.repeat(64),
  payload: {
    targetId: PREPARATION_ID,
    targetVersion: 1,
    channelAccountId: CHANNEL_ACCOUNT_ID,
    kind: 'register' as const,
    channelListingId: null,
    applyCompositionTemplate: false,
    product: {
      id: CANDIDATE_ID,
      code: 'TOY-1',
      ownCode: null,
      sabangnetGoodsNo: null,
      sourceCandidateId: null,
      sourcePlatform: null,
      sourceUrl: null,
      name: 'Toy',
      shortName: null,
      englishName: null,
      printName: null,
      modelName: null,
      modelNo: null,
      brand: null,
      manufacturer: null,
      originCountry: null,
      originRegion: null,
      keywords: [],
      standardCategory: null,
      description: '',
      targetAudience: null,
      ageGroup: null,
      productSize: null,
      colorVariantNames: [],
      boxSetQuantity: null,
      registrationDefaults: null,
      status: 'active' as const,
      taxType: 'taxable' as const,
      deliveryFeeType: null,
      deliveryFee: null,
      optionAxes: [],
      stockManaged: false,
      imageUrls: [],
      detailHtml: null,
      extraDetailHtml: [],
      noticeCategory: null,
      noticeValues: [],
      certifications: [],
      kcStatus: 'unknown' as const,
      importDeclarationNo: null,
      adminMemo: null,
      version: 1,
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
      options: [{
        id: SALES_PRODUCT_OPTION_ID,
        optionCode: 'TOY-1-0001',
        values: [],
        optionKey: '',
        alias: null,
        barcode: null,
        salePrice: 1_000,
        normalPrice: null,
        supplyStatus: 'selling' as const,
        safetyStock: null,
        sortOrder: 0,
        components: [],
        linkedChannelOptionCount: 0,
      }],
      channelOverrides: [],
      channelListings: [],
    },
    registrationInput: {},
    supplyPrices: [{ salesProductOptionId: SALES_PRODUCT_OPTION_ID, supplyPrice: null }],
  },
  leaseToken: null,
  maySubmit: false,
  externalListingId: null,
  result: null,
  createdAt: '2026-08-28T00:00:00.000Z',
};

const scenarios: readonly InvocationScenario[] = [
  scenario('analytics.readOverview', 'analytics.readOverview', 'none', { period: 'today' }, {
    sales: { revenue: 1, orders: 1 },
    inventory: { outOfStockSkus: 0, mappingAttentionSkus: 0 },
    freshness: { lastSync: null },
  }),
  scenario('channels.get_target_execution', 'channels.getTargetExecution', 'none', {
    executionId: OPERATION_ID,
  }, targetExecutionResult),
  scenario('channels.prepare_target_execution', 'channels.prepareTargetExecution', 'low', {
    targetId: PREPARATION_ID,
    expectedVersion: 1,
    kind: 'register',
    applyCompositionTemplate: false,
  }, targetExecutionResult),
  scenario('channels.register_confirmed_listing', 'channels.registerConfirmedListing', 'medium', {
    registrationExecutionId: OPERATION_ID,
    preparationId: PREPARATION_ID,
    externalListingId: 'listing-1',
    confirmationEvidence: {
      wingVendorId: 'vendor-1',
      wingIdentitySource: 'dom:data-vendor-id',
    },
  }, { preparationId: PREPARATION_ID, listingId: CANDIDATE_ID, status: 'registered' }),
  scenario('channels.report_target_execution', 'channels.reportTargetExecution', 'medium', {
    executionId: OPERATION_ID,
    leaseToken: CHANNEL_ACCOUNT_ID,
    payloadHash: 'c'.repeat(64),
    outcome: 'uncertain',
    evidence: { channelAccountId: CHANNEL_ACCOUNT_ID },
  }, targetExecutionResult),
  scenario('channels.start_target_execution', 'channels.startTargetExecution', 'medium', {
    executionId: OPERATION_ID,
  }, targetExecutionResult),
  scenario('channels.submit_wing_thumbnail', 'channels.submitWingThumbnail', 'high', { generationId: 'generation-1' }, {
    success: true,
    screenshotPath: null,
  }),
  scenario('products.create_listing_generation_package', 'products.createListingGenerationPackage', 'medium', { salesProductId: CANDIDATE_ID }, {
    salesProductId: CANDIDATE_ID,
    detailGenerationId: CANDIDATE_ID,
    thumbnailGenerationId: CANDIDATE_ID,
    contentWorkspaceId: CANDIDATE_ID,
    href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
  }),
  scenario('sourcing.createReviewBatch', 'sourcing.createReviewBatch', 'low', {
    recommendationRunId: RECOMMENDATION_RUN_ID,
    workspaceKey: 'entry',
    items: [{ itemKey: 'item-1', expectedVersion: 0 }],
  }, { reviewBatchId: 'review-1', itemCount: 1, status: 'pending_review' }),
  scenario('sourcing.duplicateCheck', 'sourcing.duplicateCheck', 'none', { sourceUrl: SOURCE_URL }, {
    duplicate: false,
    candidateId: null,
  }),
  scenario('sourcing.ingestCandidate', 'sourcing.ingestCandidate', 'medium', { snapshot }, { candidateId: CANDIDATE_ID }),
  scenario('sourcing.inspectRecommendationRun', 'sourcing.inspectRecommendationRun', 'none', {
    recommendationRunId: RECOMMENDATION_RUN_ID,
  }, {
    runId: 'recommendation-run-1',
    status: 'complete',
    businessDate: '2026-08-28',
    itemCount: 1,
    warningCodes: [],
    validation: { itemCount: 1, missingCount: 0 },
  }),
  scenario('sourcing.refreshValidation', 'sourcing.refreshValidation', 'low', {
    recommendationRunId: RECOMMENDATION_RUN_ID,
  }, {
    recommendationRunId: RECOMMENDATION_RUN_ID,
    validationEpisodeIds: [],
    missingEvidence: [],
  }),
  scenario('sourcing.retrieveWorkspaceEvidence', 'sourcing.retrieveWorkspaceEvidence', 'none', { query: 'toy' }, {
    inputHash: 'b'.repeat(64),
    documentCount: 0,
    documents: [],
    dataGaps: [],
  }),
  scenario('sourcing.scrapeProductUrl', 'sourcing.scrapeProductUrl', 'none', { sourceUrl: SOURCE_URL }, { snapshot }),
  scenario('supply.create_purchase_order_draft', 'supply.createPurchaseOrderDraft', 'low', {
    masterProductId: CANDIDATE_ID,
    productName: 'Toy',
    supplierName: 'Supplier',
    unitPriceCny: 1,
    moq: 1,
  }, { orderId: 'purchase-order-1', status: 'draft' }),
  scenario('supply.submit_purchase_order', 'supply.submitPurchaseOrder', 'high', {
    purchaseOrderId: PURCHASE_ORDER_ID,
    inventoryAttemptId: '00000000-0000-4000-8000-000000000008',
  }, {
    orderId: 'purchase-order-1',
    status: 'ordered',
  }),
];

describe('actual capability MCP wire matrix', () => {
  it('discovers and invokes all 17 owner compositions with active-turn authority and code-owned responsibility profiles', async () => {
    const runtime = matrixRuntime();
    try {
      const catalog = await call(runtime.handler, 'tools/call', {
        name: 'capability_catalog_search',
        arguments: {},
      });
      const catalogContent = catalog.result.structuredContent as unknown as {
        capabilities: Array<{ key: string }>;
      };
      expect(catalogContent.capabilities.map((entry) => entry.key))
        .toEqual(FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key));
      expect(scenarios.map((entry) => entry.definition.key))
        .toEqual(FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key));
      expect(runtime.compositionProviders).toEqual([
        expect.any(AnalyticsCapabilityCompositionAdapter),
        expect.any(ChannelsCapabilityCompositionAdapter),
        expect.any(ProductsCapabilityCompositionAdapter),
        expect.any(SourcingCapabilityCompositionAdapter),
        expect.any(SupplyCapabilityCompositionAdapter),
      ]);
      expect(runtime.compositionProviders.flatMap((provider) => provider.compositions))
        .toHaveLength(17);

      for (const entry of scenarios) {
        expect(entry.definition.ownerInputPort).toBe(entry.expectedOwnerInputPort);
        expect(entry.definition.approvalRisk).toBe(entry.expectedApprovalRisk);
        const mutation = isMutation(entry.definition);
        const actingAgentKey = mutation ? responsibilityProfile(entry.definition) : undefined;
        const toolArguments = {
          capabilityKey: entry.definition.key,
          input: entry.input,
          ...(mutation
            ? {
                requestKey: `matrix:${entry.definition.key}`,
                actingAgentKey,
              }
            : {}),
        };
        const response = await call(runtime.handler, 'tools/call', {
          name: 'capability_invoke',
          arguments: toolArguments,
        });
        const expectedInvocation = {
          organizationId: ORGANIZATION_ID,
          initiatingUserId: USER_ID,
          executionId: runtime.active.executionId,
          capabilityKey: entry.definition.key,
          input: entry.input,
          ...(mutation
            ? {
                requestKey: `matrix:${entry.definition.key}`,
                actingAgentKey,
              }
            : {}),
        };
        expect(runtime.invocationCalls).toHaveBeenLastCalledWith(expectedInvocation);

        const content = response.result.structuredContent as unknown as InvocationWireResult;
        let invocationId: string | undefined;
        if (requiresApproval(entry.definition)) {
          expect(content).toMatchObject({
            kind: 'pending',
            invocation: { status: 'pending', approvalStatus: 'pending' },
          });
          invocationId = content.invocation?.id;
          if (!invocationId) throw new Error('approval_invocation_id_required');
          expect(runtime.approvalEvents.publish).toHaveBeenLastCalledWith({
            organizationId: ORGANIZATION_ID,
            initiatingUserId: USER_ID,
            conversationId: runtime.active.conversationId,
            turnId: runtime.active.turnId,
            invocationId,
          });
          await runtime.approvals.decide({
            organizationId: ORGANIZATION_ID,
            userId: USER_ID,
            invocationId,
            decision: 'approved',
          });
        } else {
          expect(content).toMatchObject({ kind: 'completed' });
          invocationId = content.invocation?.id;
        }

        const calls = runtime.typedOwnerPortCalls.get(entry.definition.key) ?? [];
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual(expectedTypedOwnerPortCall(
          entry,
          runtime.active.executionId,
          invocationId,
        ));
        const forged = await call(runtime.handler, 'tools/call', {
          name: 'capability_invoke',
          arguments: {
            ...toolArguments,
            requestKey: mutation ? `forged:${entry.definition.key}` : undefined,
            input: {
              ...entry.input,
              organizationId: 'forged-organization',
              initiatingUserId: 'forged-user',
              executionId: 'forged-execution',
              conversationId: 'forged-conversation',
              turnId: 'forged-turn',
              ownerIdempotencyKey: 'forged-owner-key',
              ownerInputHash: 'c'.repeat(64),
            },
          },
        });
        expect(forged.result.structuredContent).toMatchObject({
          kind: 'error',
          error: { code: 'CAPABILITY_INPUT_INVALID' },
        });
        expect(runtime.typedOwnerPortCalls.get(entry.definition.key) ?? []).toHaveLength(1);
      }
    } finally {
      await runtime.handler.close();
    }
  });

  it('rejects forged top-level authority before it reaches an invocation', async () => {
    const runtime = matrixRuntime();
    try {
      const response = await call(runtime.handler, 'tools/call', {
        name: 'capability_invoke',
        arguments: {
          capabilityKey: 'analytics.readOverview',
          input: { period: 'today' },
          organizationId: 'forged-organization',
          initiatingUserId: 'forged-user',
          executionId: 'forged-execution',
          conversationId: 'forged-conversation',
          turnId: 'forged-turn',
        },
      });

      expect(response.result.isError).toBe(true);
      expect(runtime.invocationCalls).not.toHaveBeenCalled();
    } finally {
      await runtime.handler.close();
    }
  });
});

interface InvocationScenario {
  definition: CapabilityDefinition;
  expectedOwnerInputPort: string;
  expectedApprovalRisk: CapabilityDefinition['approvalRisk'];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

type TypedOwnerPortCalls = Map<string, unknown[]>;

interface InvocationWireResult {
  kind: 'completed' | 'pending' | 'error';
  invocation?: { id: string; status: string; approvalStatus: string } | null;
}

function scenario(
  key: string,
  expectedOwnerInputPort: string,
  expectedApprovalRisk: CapabilityDefinition['approvalRisk'],
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): InvocationScenario {
  const definition = FINAL_CAPABILITY_DEFINITIONS.find(
    (candidate) => candidate.key === key,
  );
  if (!definition) throw new Error(`missing capability definition: ${key}`);
  return { definition, expectedOwnerInputPort, expectedApprovalRisk, input, output };
}

function matrixRuntime() {
  const typedOwnerPortCalls: TypedOwnerPortCalls = new Map();
  const compositionProviders = realCompositionProviders(typedOwnerPortCalls);
  const registry = new AgentCapabilityRegistry();
  registerFinalCapabilityCatalog(registry, compositionProviders);

  const repository = new InMemoryInvocationRepository();
  const dispatcher = new CapabilityMutationDispatcher(
    repository as never,
    registry,
    () => NOW,
  );
  const invocationService = new CapabilityInvocationService(
    repository as never,
    registry,
    () => NOW,
    undefined,
    dispatcher,
  );
  const invocationCalls = vi.fn((input: Parameters<CapabilityInvocationService['invoke']>[0]) =>
    invocationService.invoke(input),
  );
  const approvalEvents = { publish: vi.fn() };
  const active = {
    executionId: 'server-active-execution',
    installationId: 'installation-1',
    gatewayInstanceId: 'gateway-1',
    organizationId: ORGANIZATION_ID,
    initiatingUserId: USER_ID,
    conversationId: 'conversation-1',
    turnId: 'turn-1',
  };
  const dependencies: CapabilityMcpDependencies = {
    invocations: {
      invoke: invocationCalls,
      get: (input) => invocationService.get(input),
      getReceipt: (input) => invocationService.getReceipt(input),
    },
    capabilities: registry,
    readiness: {
      probe: () => ({
        protocolVersion: MCP_PROTOCOL_VERSION,
        sdkGeneration: 'v2' as const,
        protocolNegotiation: 'auto' as const,
        toolNames: CAPABILITY_MCP_TOOL_NAMES,
      }),
    },
    approvalEvents,
  };
  return {
    active,
    compositionProviders,
    typedOwnerPortCalls,
    invocationCalls,
    approvalEvents,
    approvals: new CapabilityApprovalService(repository as never, dispatcher, () => NOW),
    handler: createRequestScopedCapabilityMcpHandler(dependencies, () => active),
  };
}

function realCompositionProviders(typedOwnerPortCalls: TypedOwnerPortCalls) {
  const analytics: AnalyticsAgentOverviewCapabilityPort = {
    readOverview: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'analytics.readOverview',
      {
        sales: { revenue: 1, orders: 1 },
        inventory: { outOfStockSkus: 0, mappingAttentionSkus: 0 },
        freshness: { lastSync: null },
      },
    ),
  };
  const channels: ChannelsFinalCapabilityPort = {
    registerConfirmedListing: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'channels.register_confirmed_listing',
      { preparationId: PREPARATION_ID, listingId: CANDIDATE_ID, status: 'registered' as const },
    ),
  };
  const wing: ChannelsWingThumbnailCapabilityPort = {
    submitWingThumbnail: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'channels.submit_wing_thumbnail',
      { success: true, screenshotPath: null },
    ),
  };
  const executions = {
    prepareTargetExecution: typedOwnerExecutionPortMethod(
      typedOwnerPortCalls,
      'channels.prepare_target_execution',
      targetExecutionResult,
    ),
    getTargetExecution: typedOwnerExecutionPortMethod(
      typedOwnerPortCalls,
      'channels.get_target_execution',
      targetExecutionResult,
    ),
    startTargetExecution: typedOwnerExecutionPortMethod(
      typedOwnerPortCalls,
      'channels.start_target_execution',
      targetExecutionResult,
    ),
    reportTargetExecution: typedOwnerExecutionPortMethod(
      typedOwnerPortCalls,
      'channels.report_target_execution',
      targetExecutionResult,
    ),
  };
  const products: ProductsListingGenerationCapabilityPort = {
    createListingGenerationPackage: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'products.create_listing_generation_package',
      {
        salesProductId: CANDIDATE_ID,
        detailGenerationId: CANDIDATE_ID,
        thumbnailGenerationId: CANDIDATE_ID,
        contentWorkspaceId: CANDIDATE_ID,
        href: `/product-pipeline/collected-products/${CANDIDATE_ID}`,
      },
    ),
  };
  const sourcing: SourcingFinalCapabilityPort = {
    duplicateCheck: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.duplicateCheck',
      { duplicate: false, candidateId: null },
    ),
    scrapeProductUrl: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.scrapeProductUrl',
      { snapshot },
    ),
    ingestCandidate: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.ingestCandidate',
      { candidateId: CANDIDATE_ID },
    ),
    createReviewBatch: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.createReviewBatch',
      { reviewBatchId: 'review-1', itemCount: 1, status: 'pending_review' },
    ),
    inspectRecommendationRun: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.inspectRecommendationRun',
      {
        runId: 'recommendation-run-1',
        status: 'complete' as const,
        businessDate: '2026-08-28',
        itemCount: 1,
        warningCodes: [],
        validation: { itemCount: 1, missingCount: 0 },
      },
    ),
    refreshValidation: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.refreshValidation',
      {
        recommendationRunId: RECOMMENDATION_RUN_ID,
        validationEpisodeIds: [],
        missingEvidence: [],
      },
    ),
    retrieveWorkspaceEvidence: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'sourcing.retrieveWorkspaceEvidence',
      { inputHash: 'b'.repeat(64), documentCount: 0, documents: [], dataGaps: [] },
    ),
  };
  const supply: SupplyPurchaseOrderCapabilityPort = {
    createPurchaseOrderDraft: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'supply.create_purchase_order_draft',
      { orderId: 'purchase-order-1', status: 'draft' },
    ),
    submitPurchaseOrder: typedOwnerPortMethod(
      typedOwnerPortCalls,
      'supply.submit_purchase_order',
      { orderId: 'purchase-order-1', status: 'ordered' },
    ),
  };

  return [
    new AnalyticsCapabilityCompositionAdapter(analytics),
    new ChannelsCapabilityCompositionAdapter(channels, wing, executions as never),
    new ProductsCapabilityCompositionAdapter(products),
    new SourcingCapabilityCompositionAdapter(sourcing),
    new SupplyCapabilityCompositionAdapter(supply),
  ];
}

function typedOwnerPortMethod<Input, Output>(
  calls: TypedOwnerPortCalls,
  capabilityKey: string,
  output: Output,
): (input: Input) => Promise<Output> {
  return vi.fn(async (input: Input) => {
    const existing = calls.get(capabilityKey);
    if (existing) {
      existing.push(input);
    } else {
      calls.set(capabilityKey, [input]);
    }
    return output;
  });
}

function typedOwnerExecutionPortMethod<Output>(
  calls: TypedOwnerPortCalls,
  capabilityKey: string,
  output: Output,
): (...input: unknown[]) => Promise<Output> {
  return vi.fn(async (...input: unknown[]) => {
    const existing = calls.get(capabilityKey);
    if (existing) {
      existing.push(input);
    } else {
      calls.set(capabilityKey, [input]);
    }
    return output;
  });
}

function expectedTypedOwnerPortCall(
  entry: InvocationScenario,
  activeExecutionId: string,
  invocationId: string | undefined,
): unknown {
  const input = entry.input;
  const mutationContext = () => {
    if (!invocationId) throw new Error(`mutation_invocation_id_required:${entry.definition.key}`);
    return {
      organizationId: ORGANIZATION_ID,
      initiatingUserId: USER_ID,
      executionId: invocationId,
      ownerIdempotencyKey: `capability-invocation:${invocationId}`,
      ownerInputHash: canonicalOwnerInputHash(input),
    };
  };

  switch (entry.definition.key) {
    case 'analytics.readOverview':
      return { organizationId: ORGANIZATION_ID, ...input };
    case 'channels.prepare_target_execution': {
      const context = mutationContext();
      const { targetId, ...request } = input;
      return [
        ORGANIZATION_ID,
        targetId,
        USER_ID,
        { ...request, idempotencyKey: context.ownerIdempotencyKey },
      ];
    }
    case 'channels.get_target_execution':
      return [ORGANIZATION_ID, input.executionId, USER_ID];
    case 'channels.register_confirmed_listing':
      return { context: mutationContext(), input };
    case 'channels.report_target_execution': {
      const { executionId, ...report } = input;
      return [ORGANIZATION_ID, executionId, USER_ID, report];
    }
    case 'channels.start_target_execution':
      return [ORGANIZATION_ID, input.executionId, USER_ID];
    case 'channels.submit_wing_thumbnail': {
      const context = mutationContext();
      return {
        organizationId: context.organizationId,
        generationId: input.generationId,
        triggeredByUserId: context.initiatingUserId,
        ownerIdempotencyKey: context.ownerIdempotencyKey,
        requestHash: context.ownerInputHash,
      };
    }
    case 'products.create_listing_generation_package': {
      const context = mutationContext();
      return {
        ...input,
        organizationId: context.organizationId,
        triggeredByUserId: context.initiatingUserId,
        idempotencyKey: context.ownerIdempotencyKey,
        inputHash: context.ownerInputHash,
      };
    }
    case 'sourcing.duplicateCheck':
    case 'sourcing.retrieveWorkspaceEvidence':
    case 'sourcing.inspectRecommendationRun':
      return { context: { organizationId: ORGANIZATION_ID }, input };
    case 'sourcing.scrapeProductUrl':
      return {
        context: {
          organizationId: ORGANIZATION_ID,
          initiatingUserId: USER_ID,
          executionId: activeExecutionId,
        },
        input,
      };
    case 'sourcing.ingestCandidate':
    case 'sourcing.refreshValidation':
    case 'sourcing.createReviewBatch':
      return { context: mutationContext(), input };
    case 'supply.create_purchase_order_draft':
    case 'supply.submit_purchase_order': {
      const context = mutationContext();
      return {
        ...input,
        organizationId: context.organizationId,
        userId: context.initiatingUserId,
        idempotencyKey: context.ownerIdempotencyKey,
        inputHash: context.ownerInputHash,
      };
    }
  }
}

class InMemoryInvocationRepository {
  private readonly records = new Map<string, CapabilityInvocationRecord>();

  async admit(input: AdmitCapabilityInvocation) {
    const existing = [...this.records.values()].find(
      (record) => record.organizationId === input.organizationId && record.requestKey === input.requestKey,
    );
    if (existing) {
      return existing.inputHash === input.inputHash
        ? { kind: 'replay' as const, invocation: existing }
        : { kind: 'conflict' as const, invocation: existing };
    }
    const id = `00000000-0000-4000-8000-${String(this.records.size + 10).padStart(12, '0')}`;
    const record: CapabilityInvocationRecord = {
      id,
      organizationId: input.organizationId,
      initiatingUserId: input.initiatingUserId,
      capabilityKey: input.capabilityKey,
      actingAgentKey: input.actingAgentKey,
      requestKey: input.requestKey,
      canonicalInput: input.canonicalInput,
      inputHash: input.inputHash,
      status: 'pending',
      approvalInputHash: input.approval.required ? input.inputHash : null,
      approvalRequestedAt: input.approval.required ? input.approval.requestedAt : null,
      approvalExpiresAt: input.approval.expiresAt,
      approvalDecision: null,
      approvalDecidedByUserId: null,
      approvalDecisionReason: null,
      approvalDecidedAt: null,
      result: null,
      error: null,
      createdAt: NOW,
      updatedAt: NOW,
      finishedAt: null,
    };
    this.records.set(id, record);
    return { kind: 'created' as const, invocation: record };
  }

  async findById(input: InvocationFence): Promise<CapabilityInvocationRecord | null> {
    const record = this.records.get(input.invocationId);
    return record?.organizationId === input.organizationId ? record : null;
  }

  async findByRequestKey(input: {
    organizationId: string;
    requestKey: string;
  }): Promise<CapabilityInvocationRecord | null> {
    return [...this.records.values()].find(
      (record) => record.organizationId === input.organizationId && record.requestKey === input.requestKey,
    ) ?? null;
  }

  async listApprovedPending(): Promise<CapabilityInvocationRecord[]> {
    return [...this.records.values()].filter(
      (record) => record.status === 'pending' && record.approvalDecision === 'approved',
    );
  }

  async decideApproval(input: DecideInvocationApproval) {
    const current = await this.required(input);
    if (current.approvalInputHash !== input.inputHash) {
      throw new Error('approval_input_hash_mismatch');
    }
    if (current.approvalDecision === input.decision) {
      return { invocation: current, transitioned: false };
    }
    if (current.approvalDecision !== null) {
      throw new Error('approval_decision_immutable');
    }
    const rejected = input.decision === 'rejected';
    const updated: CapabilityInvocationRecord = {
      ...current,
      status: rejected ? 'failed' : 'pending',
      approvalDecision: input.decision,
      approvalDecidedByUserId: input.userId,
      approvalDecisionReason: input.reason,
      approvalDecidedAt: input.decidedAt,
      error: rejected
        ? { code: 'APPROVAL_REJECTED', message: 'User rejected the exact capability invocation.' }
        : null,
      finishedAt: rejected ? input.decidedAt : null,
      updatedAt: input.decidedAt,
    };
    this.records.set(updated.id, updated);
    return { invocation: updated, transitioned: true };
  }

  async recordSucceeded(input: RecordInvocationSucceeded): Promise<CapabilityInvocationRecord> {
    const current = await this.required(input);
    const updated: CapabilityInvocationRecord = {
      ...current,
      status: 'succeeded',
      result: input.result,
      error: null,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  async recordKnownFailure(input: RecordInvocationFailure): Promise<CapabilityInvocationRecord> {
    const current = await this.required(input);
    const updated: CapabilityInvocationRecord = {
      ...current,
      status: 'failed',
      error: input.error,
      finishedAt: input.finishedAt,
      updatedAt: input.finishedAt,
    };
    this.records.set(updated.id, updated);
    return updated;
  }

  private async required(input: InvocationFence): Promise<CapabilityInvocationRecord> {
    const record = await this.findById(input);
    if (!record) throw new Error('capability_invocation_not_found');
    return record;
  }
}

function isMutation(definition: CapabilityDefinition): boolean {
  return definition.effects.some((effect) => MUTATION_EFFECTS.has(effect));
}

function requiresApproval(definition: CapabilityDefinition): boolean {
  return definition.approvalRisk === 'medium' || definition.approvalRisk === 'high';
}

function responsibilityProfile(definition: CapabilityDefinition): string {
  // actingAgentKey is code-owned responsibility routing, never an authority grant.
  const profile = AGENT_DEFINITIONS.find(
    (agent) => agent.assignedDomains.includes(definition.ownerDomain),
  );
  if (!profile) throw new Error(`code_owned_responsibility_profile_missing:${definition.key}`);
  return profile.key;
}

async function call(
  handler: ReturnType<typeof createRequestScopedCapabilityMcpHandler>,
  method: string,
  params: Record<string, unknown>,
) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
        [CLIENT_CAPABILITIES_META_KEY]: { elicitation: { url: {} } },
      },
    },
  };
  const response = await handler.fetch(new Request('http://127.0.0.1/internal/agent-runtime/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'mcp-method': method,
      ...(method === 'tools/call'
        ? { 'mcp-name': (params.name as string | undefined) ?? '' }
        : {}),
    },
    body: JSON.stringify(body),
  }), { parsedBody: body });
  expect(response.status).toBe(200);
  return await response.json() as {
    result: {
      isError?: boolean;
      structuredContent: Record<string, unknown>;
    };
  };
}
