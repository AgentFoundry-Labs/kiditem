import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { AgentResultEnvelope } from '@kiditem/shared/agent-interaction';
import type { CapabilityDefinition } from '../../../common/capability-definition';
import {
  ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT,
  type AnalyticsOverviewCapabilityPort,
} from '../../../analytics/dashboard/application/port/in/analytics-overview-capability.port';
import {
  CHANNELS_FINAL_CAPABILITY_PORT,
  type ChannelsFinalCapabilityPort,
} from '../../../channels/application/port/in/capability/channels-final-capability.port';
import {
  CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT,
  type ChannelsWingThumbnailCapabilityPort,
} from '../../../channels/application/port/in/capability/wing-thumbnail.port';
import {
  PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT,
  type ProductsListingGenerationCapabilityPort,
  type ProductsListingGenerationInput,
} from '../../../products/application/port/in/capability/listing-generation.port';
import {
  SOURCING_FINAL_CAPABILITY_PORT,
  type SourcingFinalCapabilityPort,
} from '../../../sourcing/application/port/in/capability/sourcing-final-capability.port';
import {
  SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT,
  type SupplyPurchaseOrderCapabilityPort,
} from '../../../supply/application/port/in/capability/purchase-order.port';
import { FINAL_CAPABILITY_DEFINITIONS } from '../../domain/catalog/final-capability.catalog';
import {
  AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT,
  type AgentOsPlatformProbeCapabilityPort,
} from '../port/in/capability/platform-probe.port';
import type { AgentCapabilityContractHandler } from '../port/out/capability/agent-capability-handler.port';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';

export { FINAL_CAPABILITY_DEFINITIONS } from '../../domain/catalog/final-capability.catalog';

export interface FinalCapabilityContext {
  organizationId: string;
  initiatingUserId: string;
  sessionId: string;
  taskId: string;
  attemptId: string;
  agentVersionId: string;
  ownerIdempotencyKey?: string;
  applicationVersion: string;
  authorizingGitSha: string;
  runtimeType: string;
}

type OwnerInput = Record<string, unknown> & FinalCapabilityContext;
type OwnerResult = Record<string, unknown>;

/** Composition-only binding. Domain ports remain independently owned. */
export interface FinalCapabilityBinding {
  capabilityKey: string;
  invoke(input: OwnerInput): Promise<OwnerResult>;
  resourceRef?(output: OwnerResult): { kind: string; id: string } | null;
  operationRef?(output: OwnerResult): string | null;
}

export function registerFinalCapabilityCatalog(
  registry: AgentCapabilityRegistry,
  bindings: readonly FinalCapabilityBinding[],
): void {
  const byKey = new Map<string, FinalCapabilityBinding>();
  for (const binding of bindings) {
    if (byKey.has(binding.capabilityKey)) {
      throw new Error(`Final capability implementation duplicate: ${binding.capabilityKey}`);
    }
    byKey.set(binding.capabilityKey, binding);
  }
  for (const definition of FINAL_CAPABILITY_DEFINITIONS) {
    registry.registerDefinition(definition);
    const binding = byKey.get(definition.key);
    if (!binding) throw new Error(`Final capability implementation missing: ${definition.key}`);
    registry.registerImplementation(contractHandler(definition, binding));
  }
  for (const key of byKey.keys()) {
    if (!FINAL_CAPABILITY_DEFINITIONS.some((definition) => definition.key === key)) {
      throw new Error(`Final capability definition missing: ${key}`);
    }
  }
  registry.assertFinalCatalog();
}

function contractHandler(
  definition: CapabilityDefinition,
  binding: FinalCapabilityBinding,
): AgentCapabilityContractHandler {
  return {
    capabilityKey: definition.key,
    invoke: async ({ context, input }) => {
      const parsedInput = definition.inputSchema.parse(input);
      if (isMutation(definition) && !context.ownerIdempotencyKey?.trim()) {
        throw new Error(`Owner idempotency key required: ${definition.key}`);
      }
      const output = definition.outputSchema.parse(
        await binding.invoke({ ...context, ...parsedInput }),
      );
      return envelope(
        definition.key,
        output,
        binding.resourceRef?.(output) ?? null,
        binding.operationRef?.(output) ?? null,
      );
    },
  };
}

function isMutation(definition: CapabilityDefinition): boolean {
  return definition.effects.some((effect) =>
    effect === 'db_write' || effect === 'external_write' || effect === 'job_enqueue');
}

function envelope(
  key: string,
  output: OwnerResult,
  resource: { kind: string; id: string } | null,
  operation: string | null,
): AgentResultEnvelope {
  return {
    outcome: 'completed',
    summary: `${key} completed.`,
    resourceRefs: resource ? [{ ...resource, version: null }] : [],
    operationRefs: operation ? [{ kind: 'operation_run', id: operation }] : [],
    output,
  };
}

function optionalResource(kind: string, field: string) {
  return (output: OwnerResult) => typeof output[field] === 'string'
    ? { kind, id: output[field] as string }
    : null;
}

function operationRef(output: OwnerResult): string | null {
  return typeof output.operationRunId === 'string' ? output.operationRunId : null;
}

@Injectable()
export class FinalCapabilityCatalogRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: AgentCapabilityRegistry,
    @Inject(SOURCING_FINAL_CAPABILITY_PORT)
    private readonly sourcing: SourcingFinalCapabilityPort,
    @Inject(CHANNELS_FINAL_CAPABILITY_PORT)
    private readonly channels: ChannelsFinalCapabilityPort,
    @Inject(PRODUCTS_LISTING_GENERATION_CAPABILITY_PORT)
    private readonly products: ProductsListingGenerationCapabilityPort,
    @Inject(CHANNELS_WING_THUMBNAIL_CAPABILITY_PORT)
    private readonly wing: ChannelsWingThumbnailCapabilityPort,
    @Inject(ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT)
    private readonly analytics: AnalyticsOverviewCapabilityPort,
    @Inject(SUPPLY_PURCHASE_ORDER_CAPABILITY_PORT)
    private readonly supply: SupplyPurchaseOrderCapabilityPort,
    @Inject(AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT)
    private readonly platform: AgentOsPlatformProbeCapabilityPort,
  ) {}

  onModuleInit(): void {
    registerFinalCapabilityCatalog(this.registry, this.bindings());
  }

  private bindings(): readonly FinalCapabilityBinding[] {
    return [
      {
        capabilityKey: 'agent_os.platform_probe',
        invoke: async () => this.platform.platformProbe(),
      },
      {
        capabilityKey: 'analytics.readOverview',
        invoke: async (input) => this.analytics.readOverview({
          organizationId: input.organizationId,
          now: new Date(),
          ...(input.period === 'today' || input.period === 'month' ? { period: input.period } : {}),
        }),
      },
      {
        capabilityKey: 'channels.register_confirmed_listing',
        invoke: (input) => this.channels.registerConfirmedListing({
          context: channelsMutationContext(input),
          input: {
            ...channelsSubmissionInput(input),
            externalListingId: requiredText(input, 'externalListingId'),
            displayName: requiredText(input, 'displayName'),
            confirmationEvidence: input.confirmationEvidence as never,
          },
        }),
        resourceRef: optionalResource('channel_listing', 'listingId'),
      },
      {
        capabilityKey: 'channels.submit_coupang_listing',
        invoke: (input) => this.channels.submitCoupangListing({
          context: channelsMutationContext(input),
          input: channelsSubmissionInput(input),
        }),
        resourceRef: optionalResource('channel_listing', 'listingId'),
      },
      {
        capabilityKey: 'channels.submit_wing_thumbnail',
        invoke: (input) => this.wing.submitWingThumbnail({
          organizationId: input.organizationId,
          generationId: requiredText(input, 'generationId'),
          triggeredByUserId: input.initiatingUserId,
        }),
      },
      {
        capabilityKey: 'products.create_listing_generation_package',
        invoke: async (input) => ({ ...(await this.products.createListingGenerationPackage({
          ...(input as unknown as ProductsListingGenerationInput),
          organizationId: input.organizationId,
          triggeredByUserId: input.initiatingUserId,
          idempotencyKey: requiredIdempotency(input),
        })) }),
        resourceRef: optionalResource('sourcing_candidate', 'candidateId'),
        operationRef,
      },
      {
        capabilityKey: 'sourcing.duplicateCheck',
        invoke: (input) => this.sourcing.duplicateCheck({
          context: { organizationId: input.organizationId },
          input: { sourceUrl: requiredText(input, 'sourceUrl') },
        }),
        resourceRef: optionalResource('sourcing_candidate', 'candidateId'),
      },
      {
        capabilityKey: 'sourcing.scrapeProductUrl',
        invoke: (input) => this.sourcing.scrapeProductUrl({
          context: {
            organizationId: input.organizationId,
            initiatingUserId: input.initiatingUserId,
            attemptId: input.attemptId,
          },
          input: { sourceUrl: requiredText(input, 'sourceUrl') },
        }),
      },
      {
        capabilityKey: 'sourcing.ingestCandidate',
        invoke: (input) => this.sourcing.ingestCandidate({
          context: sourcingMutationContext(input),
          input: { snapshot: input.snapshot as never },
        }),
        resourceRef: optionalResource('sourcing_candidate', 'candidateId'),
      },
      {
        capabilityKey: 'sourcing.createReviewBatch',
        invoke: (input) => this.sourcing.createReviewBatch({
          context: sourcingMutationContext(input),
          input: {
            recommendationRunId: requiredText(input, 'recommendationRunId'),
            workspaceKey: input.workspaceKey === 'final' ? 'final' : 'entry',
            items: input.items as Array<{ itemKey: string; expectedVersion: number }>,
          },
        }),
        resourceRef: optionalResource('sourcing_review_batch', 'reviewBatchId'),
      },
      {
        capabilityKey: 'sourcing.inspectRecommendationRun',
        invoke: (input) => this.sourcing.inspectRecommendationRun({
          context: { organizationId: input.organizationId },
          input: typeof input.recommendationRunId === 'string'
            ? { recommendationRunId: input.recommendationRunId }
            : {},
        }),
        resourceRef: optionalResource('sourcing_recommendation_run', 'runId'),
      },
      {
        capabilityKey: 'sourcing.refreshCollection',
        invoke: (input) => this.sourcing.refreshCollection({
          context: sourcingMutationContext(input),
          input: { sources: input.sources as Array<'naver' | '1688' | 'shorts'> },
        }),
        operationRef,
      },
      {
        capabilityKey: 'sourcing.refreshValidation',
        invoke: (input) => this.sourcing.refreshValidation({
          context: sourcingMutationContext(input),
          input: { recommendationRunId: requiredText(input, 'recommendationRunId') },
        }),
      },
      {
        capabilityKey: 'sourcing.retrieveWorkspaceEvidence',
        invoke: (input) => this.sourcing.retrieveWorkspaceEvidence({
          context: { organizationId: input.organizationId },
          input: {
            query: requiredText(input, 'query'),
            ...(typeof input.topK === 'number' ? { topK: input.topK } : {}),
            ...(typeof input.days === 'number' ? { days: input.days } : {}),
          },
        }),
        resourceRef: optionalResource('sourcing_workspace_evidence', 'inputHash'),
      },
      {
        capabilityKey: 'sourcing.scrapeUrlWorkflow',
        invoke: (input) => this.sourcing.scrapeUrlWorkflow({
          context: sourcingMutationContext(input),
          input: { sourceUrl: requiredText(input, 'sourceUrl') },
        }),
        resourceRef: optionalResource('sourcing_candidate', 'candidateId'),
        operationRef,
      },
      {
        capabilityKey: 'sourcing.collect_shadow_signals',
        invoke: (input) => this.sourcing.collectShadowSignals({
          context: sourcingMutationContext(input),
          input: {},
        }),
        operationRef,
      },
      {
        capabilityKey: 'supply.create_purchase_order_draft',
        invoke: (input) => this.supply.createPurchaseOrderDraft({
          ...input,
          organizationId: input.organizationId,
          userId: input.initiatingUserId,
          idempotencyKey: requiredIdempotency(input),
        }),
        resourceRef: optionalResource('purchase_order', 'orderId'),
      },
      {
        capabilityKey: 'supply.submit_purchase_order',
        invoke: (input) => this.supply.submitPurchaseOrder({
          ...input,
          organizationId: input.organizationId,
          userId: input.initiatingUserId,
          idempotencyKey: requiredIdempotency(input),
        }),
        resourceRef: optionalResource('purchase_order', 'orderId'),
      },
    ];
  }
}

function requiredIdempotency(input: FinalCapabilityContext): string {
  if (!input.ownerIdempotencyKey?.trim()) throw new Error('owner_idempotency_key_required');
  return input.ownerIdempotencyKey;
}

function requiredText(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_required`);
  return value;
}

function sourcingMutationContext(input: OwnerInput) {
  return {
    organizationId: input.organizationId,
    initiatingUserId: input.initiatingUserId,
    attemptId: input.attemptId,
    ownerIdempotencyKey: requiredIdempotency(input),
  };
}

function channelsMutationContext(input: OwnerInput) {
  return {
    organizationId: input.organizationId,
    initiatingUserId: input.initiatingUserId,
    sessionId: input.sessionId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    agentVersionId: input.agentVersionId,
    ownerIdempotencyKey: requiredIdempotency(input),
    applicationVersion: input.applicationVersion,
    authorizingGitSha: input.authorizingGitSha,
    runtimeType: input.runtimeType,
  };
}

function channelsSubmissionInput(input: OwnerInput) {
  return {
    executionId: requiredText(input, 'executionId'),
    preparationId: requiredText(input, 'preparationId'),
    sourceCandidateId: requiredText(input, 'sourceCandidateId'),
    channelAccountId: requiredText(input, 'channelAccountId'),
    submissionKey: requiredText(input, 'submissionKey'),
    submissionPayloadHash: requiredText(input, 'submissionPayloadHash'),
    submissionPayloadJson: input.submissionPayloadJson as Record<string, unknown>,
    providerSubmissionId: typeof input.providerSubmissionId === 'string' ? input.providerSubmissionId : null,
    registrationResult: input.registrationResult,
    isRetry: input.isRetry === true,
    providerOutcome: input.providerOutcome as 'not_attempted' | 'uncertain' | 'succeeded' | 'definitive_failure',
    providerCreateAllowed: input.providerCreateAllowed === true,
    ...(typeof input.masterProductId === 'string' ? { masterProductId: input.masterProductId } : {}),
    optionLinks: input.optionLinks as Array<{ externalOptionId: string; sellpiaInventorySkuId: string; quantity: number }>,
  };
}
