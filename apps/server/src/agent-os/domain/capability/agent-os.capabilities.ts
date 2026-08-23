import { defineCapabilities, type CapabilityManifest } from '../../../common/capability-manifest';

export const AGENT_OS_CAPABILITIES = defineCapabilities([
  {
    key: 'agent_os.platform_probe', ownerDomain: 'agent_os', ownerInputPort: 'agent_os.platformProbe',
    kind: 'resource', description: 'Read bounded Agent OS platform health.', inputSchema: {}, outputSchema: { status: 'string' },
    effects: ['read'], approval: 'none', approvalRisk: 'none', idempotency: 'required', visibility: 'agent',
    entrypoint: { type: 'incoming_port', token: 'AGENT_OS_PLATFORM_PROBE_CAPABILITY_PORT' },
  },
] as const satisfies readonly CapabilityManifest[]);
