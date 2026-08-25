import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverRoot = resolve(__dirname, '../..');

const requiredOwners = [
  ['sourcing.collect_shadow_signals', 'sourcing', 'sourcing.collectShadowSignals'],
  ['products.create_listing_generation_package', 'products', 'products.createListingGenerationPackage'],
  ['channels.submit_wing_thumbnail', 'channels', 'channels.submitWingThumbnail'],
  ['agent_os.platform_probe', 'agent_os', 'agent_os.platformProbe'],
  ['analytics.readOverview', 'analytics', 'analytics.readOverview'],
  ['supply.create_purchase_order_draft', 'supply', 'supply.createPurchaseOrderDraft'],
  ['supply.submit_purchase_order', 'supply', 'supply.submitPurchaseOrder'],
] as const;

const capabilityFiles = [
  'sourcing/domain/capability/sourcing.capabilities.ts',
  'products/domain/capability/products.capabilities.ts',
  'channels/domain/capability/channels.capabilities.ts',
  'agent-os/domain/capability/agent-os.capabilities.ts',
  'analytics/domain/capability/analytics.capabilities.ts',
  'supply/domain/capability/supply.capabilities.ts',
];

describe('KID-25 owner capability boundary', () => {
  it('publishes each corrected capability exactly once from its owner input port', () => {
    const source = capabilityFiles.map((file) => {
      const path = resolve(serverRoot, file);
      expect(existsSync(path), `missing owner capability catalog: ${file}`).toBe(true);
      return readFileSync(path, 'utf8');
    }).join('\n');

    for (const [key, ownerDomain, ownerInputPort] of requiredOwners) {
      expect(source.match(new RegExp(`key: ['\"]${key.replace('.', '\\.') }['\"]`, 'g'))).toHaveLength(1);
      expect(source).toMatch(
        new RegExp(`ownerDomain: ['\"]${ownerDomain}['\"]`),
      );
      expect(source).toMatch(
        new RegExp(`ownerInputPort: ['\"]${ownerInputPort}['\"]`),
      );
    }
    expect(source).not.toContain('market.collect_shadow_signals');
    expect(source).not.toContain('product_listing.create_generation_package');
    expect(source).not.toContain('product_listing.submit_wing_thumbnail');
  });

  it('keeps business capability execution out of Agent and AgentRun wrappers', () => {
    const ownerAdapters = [
      'sourcing/adapter/in/agent/market-shadow-signal-capability.adapter.ts',
      'products/adapter/in/agent/products-listing-generation-capability.adapter.ts',
      'channels/adapter/in/agent/channels-wing-thumbnail-capability.adapter.ts',
      'supply/adapter/in/agent/supply-agent-capability.adapter.ts',
      'analytics/adapter/in/agent/analytics-overview-capability.adapter.ts',
      'sourcing/adapter/in/agent/sourcing-capability-composition.adapter.ts',
      'products/adapter/in/agent/products-capability-composition.adapter.ts',
      'channels/adapter/in/agent/channels-capability-composition.adapter.ts',
      'supply/adapter/in/agent/supply-capability-composition.adapter.ts',
      'analytics/adapter/in/agent/analytics-capability-composition.adapter.ts',
    ];
    for (const file of ownerAdapters) {
      const path = resolve(serverRoot, file);
      expect(existsSync(path), `missing owner adapter: ${file}`).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/AgentRun|AGENT_RUNNER_PORT|AgentCapabilityRegistry/);
      expect(source).not.toContain('agent-os/application');
    }
  });
});
