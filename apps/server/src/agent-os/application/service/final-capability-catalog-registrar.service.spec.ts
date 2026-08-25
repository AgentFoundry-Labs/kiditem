import { describe, expect, it } from 'vitest';
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
  'products.create_listing_generation_package':
    'products.createListingGenerationPackage',
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

const catalogPort: Record<string, () => void> = {};

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
  it('keeps the sorted 18-key catalog and its owner input ports exact', () => {
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

  it('aggregates owner-local composition units without a central capability-to-method map', () => {
    const registry = new AgentCapabilityRegistry();

    registerFinalCapabilityCatalog(registry, [compositionProvider()]);

    expect(registry.listDefinitions().map((definition) => definition.key)).toEqual(
      expectedKeys,
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

  it('keeps all ten Sourcing capabilities Agent-facing', () => {
    const sourcingKeys = FINAL_CAPABILITY_DEFINITIONS.filter(
      (definition) => definition.ownerDomain === 'sourcing',
    ).map((definition) => definition.key);

    expect(sourcingKeys).toHaveLength(10);
    expect(sourcingKeys).toEqual(
      expect.arrayContaining([
        'sourcing.duplicateCheck',
        'sourcing.scrapeProductUrl',
        'sourcing.ingestCandidate',
        'sourcing.collect_shadow_signals',
      ]),
    );
  });
});
