import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { PUBLIC_CAPABILITY_CATALOG_KEYS } from '@kiditem/shared/agent-runtime';
import type { CapabilityDefinition } from '../../../common/capability-definition';
import {
  defineCapabilityComposition,
  type CapabilityCompositionProvider,
} from '../../../common/capability-composition';
import { AgentCapabilityRegistry } from './agent-capability-registry.service';
import {
  FINAL_CAPABILITY_DEFINITIONS,
  registerFinalCapabilityCatalog,
} from './final-capability-catalog-registrar.service';

const expectedKeys = [
  'analytics.readOverview',
  'channels.register_confirmed_listing',
  'channels.submit_wing_thumbnail',
  'products.create_listing_generation_package',
  'sourcing.createReviewBatch',
  'sourcing.duplicateCheck',
  'sourcing.ingestCandidate',
  'sourcing.inspectRecommendationRun',
  'sourcing.refreshValidation',
  'sourcing.retrieveWorkspaceEvidence',
  'sourcing.scrapeProductUrl',
  'supply.create_purchase_order_draft',
  'supply.submit_purchase_order',
] as const;

const expectedOwnerInputPorts = {
  'analytics.readOverview': 'analytics.readOverview',
  'channels.register_confirmed_listing': 'channels.registerConfirmedListing',
  'channels.submit_wing_thumbnail': 'channels.submitWingThumbnail',
  'products.create_listing_generation_package':
    'products.createListingGenerationPackage',
  'sourcing.createReviewBatch': 'sourcing.createReviewBatch',
  'sourcing.duplicateCheck': 'sourcing.duplicateCheck',
  'sourcing.ingestCandidate': 'sourcing.ingestCandidate',
  'sourcing.inspectRecommendationRun': 'sourcing.inspectRecommendationRun',
  'sourcing.refreshValidation': 'sourcing.refreshValidation',
  'sourcing.retrieveWorkspaceEvidence': 'sourcing.retrieveWorkspaceEvidence',
  'sourcing.scrapeProductUrl': 'sourcing.scrapeProductUrl',
  'supply.create_purchase_order_draft': 'supply.createPurchaseOrderDraft',
  'supply.submit_purchase_order': 'supply.submitPurchaseOrder',
} as const satisfies Record<(typeof expectedKeys)[number], string>;

const catalogPort: Record<string, () => void> = {};

function expectStrictZodObjectOrUnion(schema: z.ZodTypeAny): void {
  if (schema instanceof z.ZodObject) {
    expect(schema._def.unknownKeys).toBe('strict');
    return;
  }

  if (schema instanceof z.ZodDiscriminatedUnion) {
    for (const option of schema.options) {
      expect(option._def.unknownKeys).toBe('strict');
    }
    return;
  }

  throw new Error(`Expected a strict Zod object or discriminated union, got ${schema._def.typeName}`);
}

function compositionProvider(
  definitions = FINAL_CAPABILITY_DEFINITIONS,
): CapabilityCompositionProvider {
  return {
    compositions: definitions.map((definition) =>
      defineCapabilityComposition(definition, catalogPort, {
        capabilityKey: definition.key,
        ownerInputPort: definition.ownerInputPort,
        invoke: async () => ({}),
      }),
    ),
  };
}

describe('FinalCapabilityCatalogRegistrar', () => {
  it('keeps the sorted 13-key catalog and its owner input ports exact', () => {
    expect(FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key)).toEqual(
      expectedKeys,
    );
    expect(
      Object.fromEntries(
        FINAL_CAPABILITY_DEFINITIONS.map((definition) => [
          definition.key,
          definition.ownerInputPort,
        ]),
      ),
    ).toEqual(expectedOwnerInputPorts);
  });

  it('keeps the Gateway-observable capability allowlist in parity with the authoritative catalog', () => {
    expect(PUBLIC_CAPABILITY_CATALOG_KEYS).toEqual(
      FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key),
    );
  });

  it('uses one strict owner-prefixed Zod definition per implementation without server authority inputs', () => {
    for (const definition of FINAL_CAPABILITY_DEFINITIONS) {
      const resultSummary = (definition as CapabilityDefinition & {
        resultSummary?: string;
      }).resultSummary;
      expect(definition.key).toMatch(
        new RegExp(`^${definition.ownerDomain}\\.`),
      );
      expect(definition.ownerInputPort).toMatch(
        new RegExp(`^${definition.ownerDomain}\\.`),
      );
      expect(definition.inputSchema).toBeInstanceOf(z.ZodType);
      expect(definition.outputSchema).toBeInstanceOf(z.ZodType);
      expect(typeof resultSummary).toBe('string');
      expect(resultSummary ?? '').toMatch(/[가-힣]/);
      expect(resultSummary?.trim().length ?? 0).toBeGreaterThan(0);
      expect(resultSummary?.length ?? Infinity).toBeLessThanOrEqual(1_000);
      expectStrictZodObjectOrUnion(definition.inputSchema);
      expectStrictZodObjectOrUnion(definition.outputSchema);
      expect(
        definition.inputSchema.safeParse({
          organizationId: 'forged-organization',
          initiatingUserId: 'forged-user',
          executionId: 'forged-execution',
          sessionId: 'forged-session',
          taskId: 'forged-task',
          attemptId: 'forged-attempt',
          agentVersionId: 'forged-version',
          runtimeType: 'forged-runtime',
          providerSessionId: 'forged-provider-session',
        }).success,
      ).toBe(false);
      const mutation = definition.effects.some((effect) =>
        ['db_write', 'external_write', 'job_enqueue'].includes(effect),
      );
      if (mutation) {
        expect(definition.idempotency).toBe('required');
      } else {
        expect(['none', 'low']).toContain(definition.approvalRisk);
      }
    }
  });

  it('aggregates owner-local composition units without a central capability-to-method map', () => {
    const registry = new AgentCapabilityRegistry();

    registerFinalCapabilityCatalog(registry, [compositionProvider()]);

    expect(registry.listDefinitions().map((definition) => definition.key)).toEqual(
      expectedKeys,
    );
    expect(
      registry
        .listDefinitions()
        .map((definition) => definition.key)
        .sort(),
    ).toEqual(
      [...new Set(FINAL_CAPABILITY_DEFINITIONS.map((definition) => definition.key))]
        .sort(),
    );
    for (const definition of FINAL_CAPABILITY_DEFINITIONS) {
      expect(registry.resolveImplementation(definition.key)).toMatchObject({
        capabilityKey: definition.key,
      });
    }
  });

  it('rejects an owner aggregate that omits one expected definition', () => {
    const registry = new AgentCapabilityRegistry();
    const missingSupplySubmission = FINAL_CAPABILITY_DEFINITIONS.filter(
      (definition) => definition.key !== 'supply.submit_purchase_order',
    );

    expect(() =>
      registerFinalCapabilityCatalog(registry, [
        compositionProvider(missingSupplySubmission),
      ]),
    ).toThrow('does not match the expected definitions');
  });

  it('rejects a lookalike definition even when its capability key is unchanged', () => {
    const registry = new AgentCapabilityRegistry();
    const productsDefinition = FINAL_CAPABILITY_DEFINITIONS.find(
      (definition) =>
        definition.key === 'products.create_listing_generation_package',
    );
    if (!productsDefinition) {
      throw new Error('products capability definition missing from test catalog');
    }
    const lookalike = {
      ...productsDefinition,
      description: 'A lookalike definition must not replace the owner catalog.',
    };
    const compositions = compositionProvider().compositions.map(
      (composition) =>
        composition.definition.key === lookalike.key
          ? defineCapabilityComposition(lookalike, catalogPort, {
              capabilityKey: lookalike.key,
              ownerInputPort: lookalike.ownerInputPort,
              invoke: async () => ({}),
            })
          : composition,
    );

    expect(() =>
      registerFinalCapabilityCatalog(registry, [{ compositions }]),
    ).toThrow('definition differs');
  });

  it('keeps the seven direct Sourcing capabilities Agent-facing', () => {
    const sourcingKeys = FINAL_CAPABILITY_DEFINITIONS.filter(
      (definition) => definition.ownerDomain === 'sourcing',
    ).map((definition) => definition.key);

    expect(sourcingKeys).toHaveLength(7);
    expect(sourcingKeys).toEqual(
      expect.arrayContaining([
        'sourcing.duplicateCheck',
        'sourcing.scrapeProductUrl',
        'sourcing.ingestCandidate',
        'sourcing.refreshValidation',
      ]),
    );
  });
});
