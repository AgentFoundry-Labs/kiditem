import { defineCapabilities, type CapabilityManifest } from '../../../common/capability-manifest';

export const ANALYTICS_CAPABILITIES = defineCapabilities([
  {
    key: 'analytics.readOverview', ownerDomain: 'analytics', ownerInputPort: 'analytics.readOverview',
    kind: 'resource', description: 'Read the current organization analytics overview.',
    inputSchema: { period: 'today|month|undefined' }, outputSchema: { sales: 'object', inventory: 'object', freshness: 'object' },
    effects: ['read'], approval: 'none', approvalRisk: 'none', idempotency: 'required', visibility: 'agent',
    entrypoint: { type: 'incoming_port', token: 'ANALYTICS_AGENT_OVERVIEW_CAPABILITY_PORT' },
  },
] as const satisfies readonly CapabilityManifest[]);
